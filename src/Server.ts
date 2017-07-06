import * as SocketServer from 'socket.io';
import * as SocketClient from 'socket.io-client';
import * as http from 'http';
import * as express from 'express';
import * as defer from 'promise-defer';
import * as uid from 'uid';
import * as fs from 'fs';
import * as path from 'path';
import { Bundle, BundleDisposable, FileRecord } from "./Bundle";
import { DevicesManager } from "./FileSystems/DevicesManager";
import { FileSystem, WatchEvent, filterWatchFiles, applyWatchEvents } from "./FileSystems/FileSystem";
import { NativeFileSystem } from "./FileSystems/NativeFileSystem";
import { PathUtils } from "./PathUtils";
import { Sockets } from "./Sockets";
import { InternetProtocol } from "./InternetProtocol";
import { EventEmitter } from "events";
import { ServerTransportsManager } from "./Transports/TransportsManager";
import { HttpServerTransport } from "./Transports/HttpTransport";
import { ServerTransport } from "./Transports/Transport";

export class Server extends EventEmitter {
    targets : string[];

    devices : DevicesManager;

    port : number;

    express : express.Express;

    http : http.Server;

    bundles : Map<string, Bundle> = new Map();

    transports : ServerTransportsManager = new ServerTransportsManager();

    clients : ClientConnection[] = [];

    constructor ( files : string[], targets : string[] ) {
        super();

        this.targets = targets;
        
        this.devices = new DevicesManager();

        this.mount( files );

        this.transports.add( 'http', new HttpServerTransport() );

        this.transports.defaultTransport = 'http';
    }

    mount ( paths : string | string[] ) : this;
    mount ( endpoint : string, paths : string | string[] ) : this;
    mount ( endpoint : string, fs : FileSystem ) : this;
    mount ( endpoint : string | string[], fs ?: FileSystem | string | string[] ) : this {
        if ( !fs ) {
            return this.mount( '', endpoint );
        }

        endpoint = endpoint as string;

        if ( typeof fs === 'string' ) {
            fs = [ fs ];
        }

        if ( fs instanceof Array ) {
            for ( let target of fs ) {
                target = path.resolve( target );

                this.mount( PathUtils.join( endpoint, path.basename( target ) ), new NativeFileSystem( target ) );
            }

            return this;
        }

        this.devices.mount( endpoint, fs );

        return this;
    }

    async fetch ( client : ClientConnection, path ?: string, transportName ?: string ) {
        const bundle = this.serve( client, await this.devices.fetch( path ) );

        return bundle.toJSON();
    }

    serve ( client : ClientConnection, files : FileRecord[], transportName ?: string ) : Bundle {
        const transport = this.transports.getOrDefault( transportName );

        if ( !transport ) {
            throw new Error( `Could not find a transport named "${ transportName }"` );
        }

        const id : string = uid( 32 );

        const bundle = new Bundle( id, files );

        this.bundles.set( id, bundle );

        client.addDisposable( new BundleDisposable( this.bundles, bundle ) );

        if ( transport.serve ) {
            transport.serve( bundle );
        }

        return bundle;
    }

    async watch ( client : ClientConnection, path ?: string, transport ?: string ) : Promise<WatchCommandResponse> {
        const deferred = defer<void>();

        const id : string = uid( 32 );        

        const isFile : ( file : FileRecord ) => boolean = file => file.stats.type === 'file';

        const events = this.devices.watch( path || '', deferred.promise )
            .map( event => filterWatchFiles( [ event ], isFile )[ 0 ] ).filter( x => !!x )
            .multicast();

        events.filter( event => event.type !== 'ready' ).forEach( event => {
            const files = applyWatchEvents( [], [ event ] );

            if ( files.length ) {
                const bundle = this.serve( client, files ).toJSON();

                client.socket.emit( 'watch', { id, bundle } );
            }
        } );

        client.addDisposable( new ClientWatcherDisposable( client, deferred ) );

        const event = await events.take( 1 ).reduce<WatchEvent>( ( _, a ) => a, null );

        const bundle = this.serve( client, event.files ).toJSON();

        return { id, bundle };
    }

    async onCommand ( client : ClientConnection, command : CommandMessage ) {
        const socket = client.socket;

        this.emit( 'command', command, socket );

        if ( command.name === 'fetch' ) {
            return this.fetch( client, command.path, command.transport );
        } else if ( command.name === 'list' ) {
            return {
                files: await this.devices.list( command.path, {
                    recursive: command.recursive || false,
                    folderSizes: command.folderSizes || false
                } )
            };
        } else if ( command.name === 'watch' ) {
            return await this.watch( client, command.path, command.transport );
        } else {
            throw new Error( 'Invalid command: ' + command.name );
        }
    }

    async listen ( port : number = 8099 ) {
        this.port = port;

        this.express = express();

        this.http = http.createServer( this.express );

        this.transports.setup( this );

        const io = SocketServer( this.http );

        io.on('connection', socket => {
            const client = new ClientConnection( socket );

            client.addDisposable( new ClientConnectionDisposable( this, client ) );

            if ( InternetProtocol.allowed( client.address, this.targets ) ) {
                Sockets.on( socket, 'command', this.onCommand.bind( this, client ) );
            } else {
                socket.disconnect();
            }
        } );

        this.http.listen( port );
    }
}

export type CommandMessage = FetchCommandMessage | ListCommandMessage | WatchCommandMessage;

export interface FetchCommandMessage {
    name: 'fetch';
    path ?: string;
    transport ?: string;
    watch ?: boolean;
}

export type FetchCommandResponse = any;

export interface ListCommandMessage {
    name: 'list';
    path ?: string;
    recursive?: boolean;
    folderSizes?: boolean;
}

export interface WatchCommandMessage {
    name: 'watch';
    path ?: string;
    transport ?: string;
}

export interface WatchCommandResponse {
    id: string;
    bundle: FetchCommandResponse;
}

export interface IDisposable {
    equals ( obj : IDisposable ) : boolean;

    dispose () : void | Promise<void>;
}

export interface IDisposablesContainer extends IDisposable {
    addDisposable ( disposable : IDisposable ) : void;
    removeDisposable ( disposable : IDisposable ) : void;
}

export class ClientConnection extends EventEmitter implements IDisposablesContainer {
    socket : SocketIO.Socket;

    disposables : IDisposable[] = [];

    get address () : string {
        return this.socket.request.connection.remoteAddress;
    }

    constructor ( socket : SocketIO.Socket ) {
        super();

        this.socket = socket;

        this.socket.on( 'disconnect', () => {
            this.disconnect();
        } );
    }

    disconnect () {
        this.emit( 'disconnect' );

        this.dispose();
    }

    addDisposable ( disposable : IDisposable ) : void {
        this.disposables.push( disposable );
    }

    removeDisposable ( disposable : IDisposable ) : void {
        const obj = this.disposables.find( each => each.equals( disposable ) );

        const index = this.disposables.indexOf( obj );

        if ( index >= 0 ) {
            this.disposables.splice( index, 1 );
        }
    }

    equals ( obj : IDisposable ) : boolean {
        if ( obj instanceof ClientConnection ) {
            return obj.socket == this.socket;
        }

        return false;
    }

    async dispose () : Promise<void> {
        for ( let disposable of this.disposables ) {
            await disposable.dispose();
        }
    }
}

export class ClientConnectionDisposable implements IDisposable {
    server : Server;
    client : ClientConnection;

    constructor ( server : Server, client : ClientConnection ) {
        this.server = server;
        this.client = client;
    }

    equals ( obj : IDisposable ) : boolean {
        if ( obj instanceof ClientConnectionDisposable ) {
            return this.server == obj.server && this.client.equals( obj.client );
        }

        return false;
    }

    dispose () {
        let index;
        
        do {
            index = this.server.clients.indexOf( this.client );

            if ( index >= 0 ) {
                this.server.clients.splice( index, 1 );
            }
        } while ( index > 0 );
    }
}

export class ClientWatcherDisposable implements IDisposable {
    client : ClientConnection;
    lifetime : defer.Deferred<void>;

    constructor ( client : ClientConnection, lifetime : defer.Deferred<void> ) {
        this.client = client;
        this.lifetime = lifetime;
    }

    equals ( obj : IDisposable ) : boolean {
        if ( obj instanceof ClientWatcherDisposable ) {
            return this.client === obj.client && this.lifetime === obj.lifetime;
        }

        return false;
    }

    dispose () {
        this.lifetime.resolve( void 0 );
    }
}
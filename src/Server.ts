import * as SocketServer from 'socket.io';
import * as SocketClient from 'socket.io-client';
import * as http from 'http';
import * as express from 'express';
import * as uid from 'uid';
import * as fs from 'fs';
import * as path from 'path';
import { Bundle } from "./Bundle";
import { DevicesManager } from "./FileSystems/DevicesManager";
import { FileSystem } from "./FileSystems/FileSystem";
import { NativeFileSystem } from "./FileSystems/NativeFileSystem";
import { PathUtils } from "./PathUtils";
import { Sockets } from "./Sockets";
import { InternetProtocol } from "./InternetProtocol";
import { EventEmitter } from "events";
import { ServerTransportsManager } from "./Transports/TransportsManager";
import { HttpServerTransport } from "./Transports/HttpTransport";

export class Server extends EventEmitter {
    targets : string[];

    devices : DevicesManager;

    port : number;

    express : express.Express;

    http : http.Server;

    bundles : Map<string, Bundle> = new Map();

    transports : ServerTransportsManager = new ServerTransportsManager();

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
                this.mount( PathUtils.join( endpoint, path.basename( target ) ), new NativeFileSystem( target ) );
            }

            return this;
        }

        this.devices.mount( endpoint, fs );

        return this;
    }

    async fetch ( path ?: string, transportName ?: string ) {
        const transport = this.transports.getOrDefault( transportName );

        if ( !transport ) {
            throw new Error( `Could not find a transport named "${ transportName }"` );
        }

        const id : string = uid( 32 );

        const bundle = new Bundle( id, await this.devices.fetch( path ) );

        this.bundles.set( id, bundle );

        if ( transport.serve ) {
            transport.serve( bundle );
        }

        return bundle.toJSON();
    }

    async onCommand ( socket : SocketIO.Socket, command : CommandMessage ) {
        this.emit( 'command', command, socket );

        if ( command.name === 'fetch' ) {
            return this.fetch( command.path, command.transport );
        } else if ( command.name === 'list' ) {
            return {
                files: await this.devices.list( command.path )
            };
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
            var clientIp = socket.request.connection.remoteAddress;

            if ( InternetProtocol.allowed( clientIp, this.targets ) ) {
                Sockets.on( socket, 'command', this.onCommand.bind( this, socket ) );
            } else {
                socket.disconnect();
            }
        } );

        this.http.listen( port );
    }
}

export type CommandMessage = FetchCommandMessage | ListCommandMessage;

export interface FetchCommandMessage {
    name: 'fetch';
    path ?: string;
    transport ?: string;
}

export interface ListCommandMessage {
    name: 'list';
    path ?: string;
}
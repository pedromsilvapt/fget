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

export class Server {
    targets : string[];

    devices : DevicesManager;

    port : number;

    bundles : Map<string, Bundle> = new Map();

    constructor ( files : string[], targets : string[] ) {
        this.targets = targets;
        
        this.devices = new DevicesManager();

        this.mount( files );
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

    async fetch ( path ?: string ) {
        const id : string = uid( 32 );

        const bundle = new Bundle( id, await this.devices.fetch( path ) );

        this.bundles.set( id, bundle );

        return bundle.toJSON();
    }

    async sendFile ( req : express.Request, res : express.Response ) {
        const bundleId : string = req.params.bundle;
        const fileId : number = +req.params.file;

        const bundle = this.bundles.get( bundleId );

        const file = bundle.files[ fileId ];

        res.attachment( path.basename( file.target ) );

        this.devices.read( file ).pipe( res );
    }

    async onCommand ( command : CommandMessage ) {
        if ( command.name === 'fetch' ) {
            const data = command as FetchCommandMessage;

            console.log( 'receiving connection from', data.ip );

            if ( this.targets.find( target => target === data.ip ) ) {
                return this.fetch( data.path )
            }
        } else if ( command.name === 'list' ) {
            const data = command as ListCommandMessage;

            console.log( 'receiving list for', data.path );

            return {
                files: await this.devices.list( data.path )
            };
        } else {
            throw new Error( 'Invalid command: ' + command.name );
        }
    }

    async listen ( port : number = 8099 ) {
        this.port = port;

        const app = express();

        const server = http.createServer( app );

        app.get( '/bundles/:bundle/:file', async ( req, res, next ) => {
            try {
                await this.sendFile( req, res );
            } catch ( error ) {
                next( error );
            }
        } );

        const io = SocketServer( server );

        io.on('connection', socket => {
            socket.emit( 'news', { hello: 'world' } );

            Sockets.on( socket, 'command', this.onCommand.bind( this ) );

            // socket.on( 'command', ( command : CommandMessage ) => {
                
            // } );
        } );

        server.listen( port );
    }
}

export interface CommandMessage {
    name: string;
}

export interface FetchCommandMessage {
    name: 'fetch';
    ip: string;
    path ?: string;
}

export interface ListCommandMessage {
    name: 'list';
    path ?: string;
}
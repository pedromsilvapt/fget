import * as SocketServer from 'socket.io';
import * as SocketClient from 'socket.io-client';
import * as http from 'http';
import * as express from 'express';
import * as uid from 'uid';
import * as fs from 'fs';
import { Bundle } from "./Bundle";

export class Server {
    files : string[];
    targets : string[];

    port : number;

    bundles : Map<string, Bundle> = new Map();

    constructor ( files : string[], targets : string[] ) {
        this.files = files;
        this.targets = targets;
    }

    async sendAll ( socket : SocketIO.Socket, path ?: string ) {
        const id : string = uid( 32 );

        const bundle = new Bundle( id, await Bundle.expand( this.files ) );

        if ( path ) {
            bundle.files = bundle.files.filter( file => file.source.startsWith( path ) );
        }

        this.bundles.set( id, bundle );

        socket.emit( 'bundle', bundle.toJSON() );
    }

    async sendFile ( req : express.Request, res : express.Response ) {
        const bundleId : string = req.params.bundle;
        const fileId : number = +req.params.file;

        const bundle = this.bundles.get( bundleId );

        const file = bundle.files[ fileId ];

        res.download( file.source );
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

            socket.on( 'command', ( command : CommandMessage ) => {
                if ( command.name === 'fetch' ) {
                    const data = command as FetchCommandMessage;

                    console.log( 'receiving connection from', data.ip );

                    if ( this.targets.find( target => target === data.ip ) ) {
                        this.sendAll( socket, data.path ).catch( error => console.error( error ) );
                    }
                }
            } );
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

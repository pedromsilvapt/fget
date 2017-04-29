import { Transport, ClientTransport, ServerTransport } from "./Transport";
import { Server } from "../Server";
import { Client, IBundleMessage } from "../Client";
import * as express from 'express';
import * as path from 'path';
import { Bundle, FileRecord } from "../Bundle";
import * as got from 'got';
import * as stream from 'stream';


export class HttpServerTransport implements ServerTransport {
    server : Server;
    
    async sendFile ( req : express.Request, res : express.Response ) {
        const bundleId : string = req.params.bundle;
        const fileId : number = +req.params.file;

        const bundle = this.server.bundles.get( bundleId );

        const file = bundle.files[ fileId ];

        res.attachment( path.basename( file.target ) );

        this.server.devices.read( file ).pipe( res );
    }

    setup ( server : Server ) {
        this.server = server;

        server.express.get( '/bundles/:bundle/:file', async ( req, res, next ) => {
            try {
                await this.sendFile( req, res );
            } catch ( error ) {
                next( error );
            }
        } );
    }
}

export class HttpClientTransport implements ClientTransport {
    client : Client;

    setup ( client : Client ) {
        this.client = client;
    }

    async fetch ( bundle : IBundleMessage, file : FileRecord ) : Promise<stream.Readable> {
        let fileId : number = bundle.files.indexOf( file );

        let source = this.client.source + '/bundles/' + bundle.id + '/'  + fileId;

        return got.stream( source );
    }
}
#! /usr/bin/env node
import * as chalk from 'chalk';
import * as program from 'commander';
import * as Vorpal from 'vorpal';
import * as logUpdate from 'log-update';

import { Server, CommandMessage } from "../Server";
import { Client, IListMessage } from "../Client";
import { FileRecord } from "../Bundle";
import { Progress, ProgressBar, ProgressReporter, IProgressReporter } from "../ProgressReporter";
import { InternetProtocol } from "../InternetProtocol";
import { PathUtils } from "../PathUtils";
import { CdCommand } from "./vorpal/CdCommand";
import { FetchCommand, TTYProgressView } from "./vorpal/FetchCommand";
import { ListCommand, ListView } from "./vorpal/ListCommand";
import { View } from "./vorpal/Common";
import { CldCommand } from "./vorpal/CldCommand";

program
    .version('0.0.1')

program.command( 'serve <files...>' )
    .description( 'send a file/folder' )
    .option( '-p, --port <port>', 'Port to use to listen for connections', x => +x, 8099 )
    .action( async ( files : string[], options ) => {
        try {
            console.log( chalk.yellow( 'Starting up fget, serving' ), chalk.cyan( files.join( ',' ) ) );

            const server = new Server( files, [ '192.168.1.4' ] );

            await server.listen();

            console.log( chalk.yellow( 'Available on:' ) );
            console.log( '\t', chalk.green( 'http://127.0.0.1:' + server.port ) );
            console.log( '\t', chalk.green( 'http://' + InternetProtocol.address() + ':' + server.port ) );

            server.on( 'command', ( command : CommandMessage, socket : SocketIO.Socket ) => {
                const ip = socket.request.connection.remoteAddress;

                if ( command.name === 'fetch' ) {
                    console.log( chalk.blue( 'fetch' ), chalk.green( '/' + PathUtils.normalize( command.path || '' ) ), chalk.grey( 'from ' + ip ) );
                } else if ( command.name === 'list' ) {
                    console.log( chalk.blue( 'list ' ), chalk.green( '/' + PathUtils.normalize( command.path || '' ) ), chalk.grey( 'from ' + ip ) );
                }
            } )
        } catch ( error ) {
            console.error( error );
        }
    } );

program.command( 'fetch <server> [path]' )
    .description( 'Receive a transmission from a server' )
    .option( '-c, --concurrency <concurrency>', 'Maximum number of concurrent files to download' )
    .option( '-t, --to <target>', 'Specify a custom target folder to where the files will be transferred. Defaults to the current working dir' )
    .option( '-s, --stream', 'Redirects output to the stdout. Only transfers the first file found' )
    .option( '-i, --no-tty', 'Allows interactivity and colors/custom codes', x => !!x, true )
    .action( async ( server : string, path : string, options : any ) => {
        const client = new Client( 'http://' + server );

        let view : View & Partial<IProgressReporter> = options.tty ? new TTYProgressView( 'fetching', logUpdate ) : new TTYProgressView( 'fetching', logUpdate );

        try {
            client.concurrency = +options.concurrency || 1;

            await client.download( options.to || process.cwd(), path, view );

        } catch ( error ) {
            view.throw( error );
        } finally {
            client.socket.close();
        }
    } );

program.command( 'list <server> [path]' )
    .description( 'Query the server for a description of available resources at the specified path' )
    .alias( 'ls' )
    .option( '-s, --size', 'Display sizes of directories' )
    .action( async ( server : string, path : string, options : any ) => {
        const client = new Client( 'http://' + server );

        let view : ListView = new ListView( console );

        try {
            view.render( await client.list( path ) );
        } catch ( error ) {
            view.throw( error );
        } finally {
            client.socket.close();
        }
    } );

program.command( 'connect <server> [path]' )
    .description( 'Create a persistent connection to a remote server.' )
    .action( async ( server : string, path : string, options : any ) => {
        const client = new Client( 'http://' + server );

        const vorpal = Vorpal();

        new CdCommand( client, vorpal );
        new CldCommand( client, vorpal );
        new FetchCommand( client, vorpal );
        new ListCommand( client, vorpal );

        vorpal
            .delimiter( 'fget~/>' )
            .show();
    } );

program.on('*', function () {
    program.help()
} ).parse( process.argv )
#! /usr/bin/env node

import * as filesize from 'filesize';
import * as humanTime from 'human-time';
import * as prettyMs from 'pretty-ms';
import * as chalk from 'chalk';
import * as throttle from 'throttleit';
import * as logUpdate from 'log-update';
import * as program from 'commander';
import * as internalIp from 'internal-ip';
import * as TableLayout from 'table-layout';

import { Server } from "../Server";
import { Client, IListMessage } from "../Client";
import { FileRecord } from "../Bundle";
import { Progress, ProgressBar, ProgressReporter, IProgressReporter } from "../ProgressReporter";

export class View {
    throw ( error : any ) : void {
        console.error( error );
    }
}

export class ProgressView extends View {
    mainAction : string;
    
    constructor ( mainAction : string ) {
        super();

        this.mainAction = mainAction;

        this.fileProgress = throttle( this.fileProgress, 500 );
    }

    fileStarted ( bundle : any, file : FileRecord ) {
        console.log( 'starting', chalk.green( file.target ) )
    }

    fileFinished ( bundle : any, file : FileRecord ) {
        console.log( 'finished', chalk.magenta( file.target ) )
    }

    fileProgress ( bundle : any, file : FileRecord, progress : Progress ) {
        console.log( 
            this.mainAction, ProgressBar.render( progress, 30 ),
            chalk.cyan( filesize( progress.done ) ) + chalk.grey( '/' ) + chalk.cyan( filesize( progress.total ) ),
            progress.timeRemaining == Infinity ? '--' : prettyMs( progress.timeRemaining * 1000 ), filesize( progress.speed ) + '/s',
        );
    }
}

export class TTYProgressView extends View {
    current : Map<FileRecord, Progress> = new Map();

    progress : Progress;

    mainAction : string;

    constructor ( mainAction : string ) {
        super();

        this.mainAction = mainAction;

        this.render = throttle( this.render, 500 );
    }

    fileProgress ( bundle : any, file : FileRecord, progress : Progress ) {
        this.current.set( file, progress )

        this.render();
    }

    fileFinished ( bundle : any, file : FileRecord ) {
        this.current.delete( file );

        this.render();
    }

    bundleProgress ( bundle : any, progress : Progress ) {
        this.progress = progress;

        this.render();
    }

    bundleFinish () {
        logUpdate.done();
    }

    renderProgress ( label : string, progress : Progress ) : string {
        return [
            label, ProgressBar.render( progress, 30 ),
            chalk.cyan( filesize( progress.done ) ) + chalk.grey( '/' ) + chalk.cyan( filesize( progress.total ) ),
            progress.timeRemaining == Infinity ? '--' : prettyMs( progress.timeRemaining * 1000 ), filesize( progress.speed ) + '/s'
        ].join( ' ' );
    }

    render () : void {
        let lines : string[] = [];

        for ( let [ file, progress ] of this.current ) {
            lines.push(
                chalk.green( file.target ),
                this.renderProgress( this.mainAction, progress ),
                ''
            );
        }

        if ( this.progress ) {
            lines.push( chalk.green( 'total' ) );
            lines.push( this.renderProgress( this.mainAction, this.progress ), );
        }

        logUpdate( lines.join( '\n' ) );
    }
}

export class ListView extends View {
    render ( list : IListMessage ) {
        console.log( 'total', list.files.length );

        const table = new TableLayout( list.files.map( record => {
            const type : string = record.stats.type;

            return {
                size: typeof record.stats.size == 'number' ? filesize( record.stats.size ) : '--',
                createdAt: record.stats.createdAt,
                updatedAt: record.stats.updatedAt,
                name: type == 'virtual' ? chalk.yellow( record.target ) : ( type == 'folder' ? chalk.blue( record.target ) : record.target ),
            }
        } ) );

        console.log( table.toString() );
    }
}

program
    .version('0.0.1')

program.command( 'serve <files...>' )
    .description( 'send a file/folder' )
    .option( '-p, --port <port>', 'Port to use to listen for connections', x => +x, 8099 )
    .action( ( files : string[], options ) => {
        const server = new Server( files, [ '192.168.1.4' ] );

        server.listen().then( () => console.log( 'server started at', internalIp.v4() + ':' + server.port ) ).catch( console.error.bind( console ) );
    } );

program.command( 'fetch <server> [path]' )
    .description( 'receive a transmission from a server' )
    .option( '-c, --concurrency <concurrency>', 'Maximum number of concurrent files to download' )
    .option( '-t, --to <target>', 'Specify a custom target folder to where the files will be transferred. Defaults to the current working dir' )
    .option( '-s, --stream', 'Redirects output to the stdout. Only transfers the first file found' )
    .option( '-i, --no-tty', 'Allows interactivity and colors/custom codes', x => !!x, true )
    .action( async ( server : string, path : string, options : any ) => {
        const client = new Client( 'http://' + server );

        let view : View & Partial<IProgressReporter> = options.tty ? new TTYProgressView( 'fetching' ) : new TTYProgressView( 'fetching' );

        try {
            client.concurrency = +options.concurrency || 3;

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

        let view : ListView = new ListView();

        try {
            view.render( await client.list( path ) );
        } catch ( error ) {
            view.throw( error );
        } finally {
            client.socket.close();
        }
    } );

program.on('*', function () {
    program.help()
} ).parse( process.argv )
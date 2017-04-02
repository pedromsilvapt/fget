import * as filesize from 'filesize';
import * as humanTime from 'human-time';
import * as prettyMs from 'pretty-ms';
import * as chalk from 'chalk';
import * as throttle from 'throttleit';
import * as logUpdate from 'log-update';
import * as program from 'commander';
import * as internalIp from 'internal-ip';

import { Server } from "../Server";
import { Client } from "../Client";
import { FileRecord } from "../Bundle";
import { Progress, ProgressBar } from "../ProgressReporter";

// client.download( {
//     fileStarted ( bundle : any, file : FileRecord ) {
//         console.log( 'starting', chalk.green( file.target ) )
//     },
//     fileFinished ( bundle : any, file : FileRecord ) {
//         console.log( 'finished', chalk.magenta( file.target ) )
//     },
//     fileProgress: throttle ( ( bundle : any, file : FileRecord, progress : Progress ) => {
//         // console.log( 
//         //     chalk.gray( file.source ),
            
//         // );
//         console.log( 
//             'fetching', ProgressBar.render( progress, 30 ),
//             chalk.cyan( filesize( progress.done ) ) + chalk.grey( '/' ) + chalk.cyan( filesize( progress.total ) ),
//             progress.timeRemaining == Infinity ? '--' : prettyMs( progress.timeRemaining * 1000 ), filesize( progress.speed ) + '/s',
//             this
//         );
//     }, 500 )
// } );

export class ProgressView {
    current : Map<FileRecord, Progress> = new Map();

    progress : Progress;

    mainAction : string;

    constructor ( mainAction : string ) {
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
    .option( '-i, --tty', 'Allows interactivity and colors/custom codes' )
    .action( ( server : string, path : string, options : any ) => {
        const client = new Client( options.target || process.cwd(), 'http://' + server );

        client.concurrency = +options.concurrency || 3;

        client.download( path, new ProgressView( 'fetching' ) );
    } );

program.command( 'list <server> [path]' )
    .description( 'Query the server for a description of available resources at the specified path' )
    .option( '-s, --size', 'Display sizes of directories' )

program.on('*', function () {
    program.help()
} ).parse( process.argv )
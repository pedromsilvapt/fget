import { Client, IListMessage } from "../../Client";
import { IProgressReporter, ProgressBar, Progress } from "../../ProgressReporter";
import { PathUtils } from "../../PathUtils";
import { FileRecord } from "../../Bundle";
import { View, ILogger, AutoComplete } from "./Common";
import * as throttle from 'throttleit';
import * as logUpdate from 'log-update';
import * as chalk from 'chalk';
import * as filesize from 'filesize';
import * as prettyMs from 'pretty-ms';

export class FetchCommand {
    client : Client;

    constructor ( client : Client, vorpal : any ) {
        this.client = client;

        const self = this;

        vorpal.command( 'fetch [path]', 'Receive a transmission from a server' )
            .option( '-c, --concurrency <concurrency>', 'Maximum number of concurrent files to download' )
            .option( '-t, --to <target>', 'Specify a custom target folder to where the files will be transferred. Defaults to the current working dir' )
            .option( '-s, --stream', 'Redirects output to the stdout. Only transfers the first file found' )
            .autocomplete( AutoComplete( client ) )
            // .autocomplete( async ( partial : string, callback : Function ) => {
            //     const parts = PathUtils.explode( partial );

            //     const len = parts.length;

            //     const results = await client.list( PathUtils.join( ...parts.slice( 0, len - 1 ) ) ).catch( () => ( { files: [] } as IListMessage ) );

            //     let files = results.files
            //         .filter( record => record.target.indexOf( parts[ len - 1 ] ) >= 0 )
            //         .map( r => r.target + ( r.target != 'file' ? '/' : '' ) );

            //     callback( files )
            // } )
            .action( async function ( args : any, callback : Function ) {
                let view : View & Partial<IProgressReporter> = args.tty ? new TTYProgressView( 'fetching', vorpal.ui.redraw ) : new TTYProgressView( 'fetching', vorpal.ui.redraw );

                try {
                    await self.execute( view, this, args );
                } catch ( error ) {
                    view.throw( error );
                }

                callback();
            } );
    }

    async execute ( view : View & Partial<IProgressReporter>, command : any, args : any ) {
        this.client.concurrency = +args.options.concurrency || 1;

        await this.client.download( args.options.to || process.cwd(), args.path, view );
    }
}

export class ProgressView extends View {
    mainAction : string;

    constructor ( mainAction : string, logger ?: ILogger ) {
        super( logger );

        this.mainAction = mainAction;

        this.fileProgress = throttle( this.fileProgress, 500 );
    }

    fileStarted ( bundle : any, file : FileRecord ) {
        ( this.logger || console ).log( 'starting', chalk.green( file.target ) )
    }

    fileFinished ( bundle : any, file : FileRecord ) {
        ( this.logger || console ).log( 'finished', chalk.magenta( file.target ) )
    }

    fileProgress ( bundle : any, file : FileRecord, progress : Progress ) {
        ( this.logger || console ).log( 
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

    logger : any;

    constructor ( mainAction : string, logger ?: any ) {
        super( logger );

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
        ( this.logger || logUpdate ).done();
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

        ( this.logger || logUpdate )( lines.join( '\n' ) );
    }
}
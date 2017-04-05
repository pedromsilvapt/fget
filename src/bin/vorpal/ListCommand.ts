import { Client, IListMessage } from "../../Client";
import { IProgressReporter } from "../../ProgressReporter";
import { PathUtils } from "../../PathUtils";
import { View, AutoComplete } from "./Common";
import * as TableLayout from 'table-layout';
import * as Table from 'text-table';
import * as chalk from 'chalk';
import * as filesize from 'filesize';
import * as distanceInWordsToNow from 'date-fns/distance_in_words_to_now';

export class ListCommand {
    client : Client;

    constructor ( client : Client, vorpal : any ) {
        this.client = client;

        vorpal.command( 'list [path]', 'Query the server for a description of available resources at the specified path' )
            .autocomplete( AutoComplete( client, record => record.stats.type !== 'file' ) )
            // .autocomplete( async ( partial : string, callback : Function ) => {
            //     const parts = PathUtils.explode( partial );

            //     const len = parts.length;

            //     const results = await client.list( PathUtils.join( ...parts.slice( 0, len - 1 ) ) ).catch( () => ( { files: [] } as IListMessage ) );

            //     let files = results.files
            //         .filter( record => record.stats.type !== 'file' )
            //         .filter( record => record.target.indexOf( parts[ len - 1 ] ) >= 0 )
            //         .map( r => r.target + '/' );

            //     callback( files )
            // } )
            .alias( 'ls' )
            .option( '-s, --size', 'Display sizes of directories' )
            .action( async function ( args : any, callback : Function ) {
                let view : ListView = new ListView( this );

                try {
                    view.render( await client.list( args.path ) );
                } catch ( error ) {
                    view.throw( error );
                }

                callback();
            } );
    }
}

export class ListView extends View {
    render ( list : IListMessage ) {
        this.logger.log( 'total', list.files.length );

        const rows = list.files.map( record => {
            const type : string = record.stats.type;

            return {
                size: typeof record.stats.size == 'number' ? filesize( record.stats.size ) : '--',
                createdAt: record.stats.createdAt ? distanceInWordsToNow( record.stats.createdAt ) : '--',
                updatedAt: record.stats.updatedAt ? distanceInWordsToNow( record.stats.updatedAt ) : '--',
                name: type == 'virtual' ? chalk.yellow( record.target ) : ( type == 'folder' ? chalk.blue( record.target ) : record.target ),
            }
        } );

        let lines = rows.map( row => Object.keys( row ).map( key => ( row as any )[ key ] ) );

        const table = Table( lines, { align: [ 'r', 'r', 'r', 'l' ] } );

        this.logger.log( table );
    }
}
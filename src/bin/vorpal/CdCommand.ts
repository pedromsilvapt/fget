import * as vorpal from 'vorpal';
import * as chalk from 'chalk';
import { Client, IListMessage } from "../../Client";
import { PathUtils } from "../../PathUtils";
import { AutoComplete } from "./Common";

export class CdCommand {
    client : Client;

    constructor ( client : Client, vorpal : any ) {
        this.client = client;

        const self = this;

        vorpal.command( 'cd [path]', 'Show/Change the current client directory' )
            .option( '-v, --verbose', 'Show full error messages/logs' )
            .autocomplete( AutoComplete( client, record => record.stats.type !== 'file' ) )
            .action( async function ( args : any ) {
                if ( args.path ) {
                    const newDir = client.resolve( args.path );

                    try {
                        await client.list( '/' + newDir )

                        client.workingDirectory = newDir;

                        if ( args.options.verbose ) {
                            this.log( 'Working Directory changed to', chalk.blue( newDir ) );
                        }

                        vorpal.delimiter( `fget~/${ client.workingDirectory }>` );
                    } catch ( error ) {
                        this.log( chalk.red( 'Error' ), 'Invalid directory', chalk.red( newDir ), args.options.verbose ? error : '' );
                    }
                } else {
                    this.log( '/' + client.workingDirectory );
                }
            } );
    }
}
import * as vorpal from 'vorpal';
import * as chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs-promise';
import { Client, IListMessage } from "../../Client";
import { PathUtils } from "../../PathUtils";
import { AutoComplete } from "./Common";

export class CldCommand {
    client : Client;

    constructor ( client : Client, vorpal : any ) {
        this.client = client;

        const self = this;

        vorpal.command( 'cld [path]', 'Show/Change the current client local directory' )
            .option( '-v, --verbose', 'Show full error messages/logs' )
            .option( '-f, --force', 'Create the target directory if it does not exist already' )
            .autocomplete( AutoComplete( client, record => record.stats.type !== 'file' ) )
            .action( async function ( args : any ) {
                if ( args.path ) {
                    const newDir = client.resolveLocal( args.path );

                    try {
                        if ( args.options.force ) {
                            await fs.ensureDir( newDir );
                        }

                        await fs.readdir( newDir );

                        client.workingLocalDirectory = newDir;

                        if ( args.options.verbose ) {
                            this.log( 'Working Local Directory changed to', chalk.blue( newDir ) );
                        }
                    } catch ( error ) {
                        this.log( chalk.red( 'Error' ), 'Invalid directory', chalk.red( newDir ), args.options.verbose ? error : '' );
                    }
                } else {
                    this.log( client.workingLocalDirectory );
                }
            } );
    }
}
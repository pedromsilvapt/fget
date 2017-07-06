import { Client, IListMessage } from "../../Client";
import { IProgressReporter } from "../../ProgressReporter";
import { PathUtils } from "../../PathUtils";
import { View, AutoComplete, ILogger } from "./Common";
import * as TableLayout from 'table-layout';
import * as Table from 'text-table';
import * as chalk from 'chalk';
import * as filesize from 'filesize';
import * as distanceInWordsToNow from 'date-fns/distance_in_words_to_now';
import { FileRecord } from "../../Bundle";
import * as sortBy from 'sort-by';

export class ListCommand {
    client : Client;

    constructor ( client : Client, vorpal : any ) {
        this.client = client;

        vorpal.command( 'list [path]', 'Query the server for a description of available resources at the specified path' )
            .autocomplete( AutoComplete( client, record => record.stats.type !== 'file' ) )
            .alias( 'ls' )
            .option( '-r, --recursive', 'List recursively' )
            .option( '-s, --sizes', 'Show folder sizes' )
            .option( '-o, --order <fields>', 'Order by name, type, extension, date or size' )
            .action( async function ( args : any ) {
                let view : ListView = new ListView( this, {
                    order: args.options.order ? args.options.order.split( ',' ) : null,
                    folderSizes: args.options.sizes,
                    recursive: args.options.recursive
                } );

                try {
                    view.render( await client.list( args.path, {
                        folderSizes: view.options.folderSizes,
                        recursive: view.options.recursive
                    } ) );
                } catch ( error ) {
                    view.throw( error );
                }
            } );
    }
}

export interface ListViewOptions {
    order: string[];
    recursive: boolean;
    folderSizes: boolean;
}

export class ListView extends View {
    options : ListViewOptions;

    constructor ( logger : ILogger, options : Partial<ListViewOptions> = {} ) {
        super( logger );

        this.options = {
            order: [ 'name' ],
            recursive: false,
            folderSizes: false,
            ...options
        };
    }

    sumSize ( files : FileRecord[] ) : number {
        return files
            .map( record => typeof record.stats.size == 'number' ? record.stats.size : 0 )
            .reduce( ( sum, size ) => sum + size, 0 );
    }

    treeify ( files : FileRecord[] ) : FileTree {
        const tree = FileTree.build( files );
        
        if ( this.options.order ) {
            const order = this.options.order.map( field => {
                if ( field.startsWith( '<' ) ) {
                    field = field.slice( 1 );
                } else if ( field.startsWith( '>' ) ) {
                    field = '-' + field.slice( 1 );
                }

                let fieldName : string = field.startsWith( '-' ) ? field.slice( 1 ) : field;

                if ( fieldName === 'size' ) {
                    fieldName = 'stats.size';
                } else if ( fieldName === 'type' ) {
                    fieldName = 'stats.type';
                } else if ( fieldName === 'date' ) {
                    fieldName = 'stats.updatedAt';
                } else if ( fieldName === 'updated' ) {
                    fieldName = 'stats.updatedAt';
                } else if ( fieldName === 'created' ) {
                    fieldName = 'stats.createdAt';
                } else if ( fieldName === 'name' ) {
                    fieldName = 'target';
                }

                return field.startsWith( '-' ) ? '-' + fieldName : fieldName;
            } );

            console.log( order );

            tree.sort( order );
        } else {
            tree.sort( [ 'name' ] );
        }

        return tree;
    }

    render ( list : IListMessage ) {
        const tree = this.treeify( list.files );

        const size = this.options.recursive ? tree.size() : this.sumSize( list.files );

        this.logger.log( 'total', list.files.length, '(' + filesize( size ) + ')' );

        const rows = tree.flatten( ( record, level ) => {
            const type : string = record.stats.type;

            const label = ( level > 0 ? ( ' '.repeat( level ) + '- ' ) : '' ) + PathUtils.basename( record.target );

            const labelColored : string = 
                type == 'virtual' ? 
                    chalk.yellow( label ) : 
                    ( type == 'folder' ? 
                        chalk.blue( label ) : label );

            return {
                size: typeof record.stats.size == 'number' ? filesize( record.stats.size ) : '--',
                createdAt: record.stats.createdAt ? distanceInWordsToNow( record.stats.createdAt ) : '--',
                updatedAt: record.stats.updatedAt ? distanceInWordsToNow( record.stats.updatedAt ) : '--',
                name: labelColored,
            }
        } );
        
        let lines = rows.map( row => Object.keys( row ).map( key => ( row as any )[ key ] ) );

        const table = Table( lines, { align: [ 'r', 'r', 'r', 'l' ] } );

        this.logger.log( table );
    }
}

export class FileTree {
    static build ( files : FileRecord[] ) : FileTree {
        const parents : Map<string, FileTree> = new Map();

        for ( let file of files ) {
            let tree : FileTree;

            if ( file.stats.type !== 'file' ) {
                if ( !parents.has( file.target ) ) {
                    tree = new FileTree( file );
                    
                    parents.set( file.target, tree );
                } else {
                    tree = parents.get( file.target );

                    tree.root = file;
                }
            } else {
                tree = new FileTree( file );
            }

            const parent = PathUtils.dirname( file.target );

            if ( !parents.has( parent ) ) {
                parents.set( parent, new FileTree( null ) );
            }

            parents.get( parent ).addChild( tree );
        }

        return new FileTree( null, Array.from( parents.values() )
            .filter( tree => tree.root == null )
            .map( tree => tree.children )
            .reduce( ( acc, trees ) => acc.concat( trees ), [] ) );
    }

    root : FileRecord;

    children : FileTree[];

    constructor ( root : FileRecord, children : FileTree[] = [] ) {
        this.root = root;
        this.children = children;
    }

    addChild ( child : FileTree ) : this {
        this.children.push( child );
        
        return this;
    }

    sort ( fields : string[] ) : this {
        for ( let child of this.children ) {
            child.sort( fields );
        }

        const sorter = sortBy( ...fields );

        this.children = this.children.sort( ( a, b ) => sorter( a.root || {}, b.root || {} ) );

        return this;
    }

    length () {
        return this.reduce( ( s, n ) => s + 1, 0 );
    }

    size () {
        return this.reduce( ( s, n ) => s + ( n.stats.ownSize || 0 ), 0 );
    }

    reduce<T> ( reducer : ( seed : T, record : FileRecord ) => T, seed : T ) : T {
        for ( let child of this.children ) {
            seed = child.reduce( reducer, seed );
        }

        if ( this.root ) {
            seed = reducer( seed, this.root );
        }

        return seed;
    }

    flatten () : FileRecord[];
    flatten<T> ( mapper : ( record : FileRecord, level : number ) => T ) : T[];
    flatten<T> ( mapper ?: ( record : FileRecord, level : number ) => T ) : (T | FileRecord)[] {
        let base : FileRecord[] = this.root ? [ this.root ] : [];

        const increase : number = this.root ? 1 : 0;

        if ( mapper ) {
            return base.map( root => mapper( root, 0 ) ).concat( 
                this.children.map( 
                    node => node.flatten( ( record, level ) => mapper( record, level + increase ) )
                ).reduce( ( s, a ) => s.concat( a ), [] )
            );
        } else {
            return [ 
                ...base, 
                ...this.children.map( node => node.flatten() ).reduce( ( s, a ) => s.concat( a ), [] )
            ];
        }
    }
}
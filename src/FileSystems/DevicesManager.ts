import * as fs from 'fs-promise';
import * as most from 'most';
import { FileSystem, WatchEvent, mergeWatchEvents, ListOptions } from "./FileSystem";
import { PathUtils } from "../PathUtils";
import { FileRecord } from "../Bundle";

export class DevicesManager implements FileSystem {
    endpoints : Map<string, FileSystem> = new Map();

    /**
     * Locate a single subfile system. If no subsystem can be unequivocally found,
     * then return null.
     * 
     * @param {string} path 
     * @returns {[ FileSystem, string, string ]} 
     * 
     * @memberof DevicesManager
     */
    locate ( path : string ) : [ FileSystem, string, string ] {
        if ( typeof path !== 'string' ) {
            return null;
        }

        let [ endpoint, rest ] = PathUtils.explode( path, 2 );

        if ( this.endpoints.has( endpoint ) ) {
            return [ this.endpoints.get( endpoint ), endpoint, rest ];
        }
    }

    /**
     * Return an array of sub-filesystems. It either returns all subsystems, of the
     * one associated with the next path segment.
     * 
     * @param {string} path 
     * @returns {[ FileSystem, string, string ][]} 
     * 
     * @memberof DevicesManager
     */
    locateAll ( path : string ) : [ FileSystem, string, string ][] {
        if ( typeof path === 'string' && path.startsWith( '/' ) ) {
            path = path.slice( 1 );
        }

        if ( !path ) {
            return Array.from( this.endpoints.entries() )
                .map<[ FileSystem, string, string ]>( 
                    ( [ name, fs ] ) => [ fs, name, null ] 
                );
        }

        let match = this.locate( path );

        if ( match ) {
            return [ match ];
        }
    }

    watch ( paths : string | string[], lifetime : Promise<void> ) : most.Stream<WatchEvent> {
        if ( typeof paths === 'string' ) {
            paths = [ paths ];
        }

        const unfold : ( endpoint : string, event : WatchEvent ) => WatchEvent = ( endpoint, event ) => {
            if ( event.files ) {
                event.files.forEach( file => file.unfold( endpoint ) );
            }

            return event;
        };

        const matches = paths
            .map( path => this.locateAll( path ) )
            .reduce( ( a, b ) => a.concat( b ), [] );

        const streams = matches.map( ( [ filesystem, endpoint, rest ] ) => {
            return filesystem.watch( rest, lifetime ).map( event => unfold( endpoint, event ) );
        } );

        // TODO
        return most.mergeArray( streams );

        return mergeWatchEvents( streams );
    }

    read ( file : FileRecord ) : fs.ReadStream {
        const match = this.locate( file.source );

        if ( !match ) {
            throw new Error( `Could not find a match.` );            
        }

        const [ fs, name, rest ] = match;

        file = file.clone();
        
        file.source = rest;

        return fs.read( file );
    }

    async fetch ( paths ?: string | string[] ) : Promise<FileRecord[]> {
        let unfoldTarget : boolean = false;

        if ( !paths || paths === '/' ) {
            paths = Array.from( this.endpoints.keys() );
            unfoldTarget = true;
        }

        if ( typeof paths === 'string' ) {
            paths = [ paths ];
        }

        const matches = paths.map( path => this.locate( path ) );

        let bundles : Promise<FileRecord[]>[] = [];

        for ( let match of matches ) {
            if ( !match ) {
                throw new Error( `Could not find a match.` );
            }

            let [ fs, name, path ] = match;

            bundles.push( fs.fetch( path || '' ).then( files => {
                for ( let file of files ) {
                    file.unfold( name, unfoldTarget );
                }

                return files;
            } ) );
        }

        return ( [] as FileRecord[] ).concat( ...( await Promise.all( bundles ) ) );
        
    }

    async list ( path : string = '', options : Partial<ListOptions> = {} ) : Promise<FileRecord[]> {
        if ( !path || path == '/' ) {
            const records = Array.from( this.endpoints.keys() )
                .map( name => new FileRecord( name, name, { type: 'virtual' } ) );

            
            if ( options.recursive || options.folderSizes ) {
                for ( let device of Array.from( records ) ) {
                    const children = await this.list( device.target, options );

                    if ( options.recursive ) {
                        records.push( ...children );
                    }

                    if ( options.folderSizes ) {
                        if ( options.recursive ) {  
                            // Because when recursive, we get folders and folders' contents too. Summing the size would lead to duplicates.                                              
                            device.stats.childrenSize = children.reduce( ( s, r ) => s + r.stats.ownSize, 0 );
                        } else {
                            // When not recursive, we should account for the full size to get a correct reading.                            
                            device.stats.childrenSize = children.reduce( ( s, r ) => s + r.stats.size, 0 );
                        }

                        device.stats.ownSize = 0;

                        device.stats.size = device.stats.childrenSize;
                    }
                }
            }

            return records;
        }

        let matches = this.locateAll( path );

        if ( !matches ) {
            throw new Error( 'Could not find a mounted path for ' + path );
        }

        let files : Promise<FileRecord[]>[] = [];

        for ( let match of matches ) {
            const [ fs, name, rest ] = match;

            files.push( fs.list( rest, options ).then( files => {
                for ( let file of files ) {
                    file.unfold( name, false );
                }

                return files;
            } ) );
        }

        return ( [] as FileRecord[] ).concat( ...( await Promise.all( files ) ) );
    }

    async find ( path : string ) : Promise<FileRecord[]> {
        let matches = this.locateAll( path );

        if ( !matches ) {
            throw new Error( 'Could not find a mounted path for ' + path );
        }

        let files : Promise<FileRecord[]>[] = [];

        for ( let match of matches ) {
            const [ fs, rest ] = match;

            files.push( fs.find( rest ).then( files => {
                for ( let file of files ) {
                    file.unfold( path );
                }

                return files;
            } ) );
        }

        return ( [] as FileRecord[] ).concat( ...( await Promise.all( files ) ) );
    }

    mount ( endpoint : string, fs : FileSystem ) {
        let [ name, rest ] = PathUtils.explode( endpoint, 2 );

        if ( !rest ) {
            if ( this.endpoints.has( name ) ) {
                throw new Error( 'Cannot mount. Already has a file system mounted at ' + name );
            }

            this.endpoints.set( name, fs );
        } else {
            let subFs = this.endpoints.get( name );

            if ( !subFs ) {
                subFs = new DevicesManager();

                this.endpoints.set( name, subFs );
            }

            if ( subFs instanceof DevicesManager ) {
                subFs.mount( rest, fs );
            } else {
                throw new Error( 'Cannot mount. Already has a file system mounted at ' + name );
            }
        }
    }
}

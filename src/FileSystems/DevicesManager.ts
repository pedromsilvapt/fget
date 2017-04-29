import * as fs from 'fs-promise';
import { FileSystem } from "./FileSystem";
import { PathUtils } from "../PathUtils";
import { FileRecord } from "../Bundle";

export class DevicesManager implements FileSystem {
    endpoints : Map<string, FileSystem> = new Map();

    locate ( path : string ) : [ FileSystem, string, string ] {
        if ( typeof path !== 'string' ) {
            return null;
        }

        let [ endpoint, rest ] = PathUtils.explode( path, 2 );

        if ( this.endpoints.has( endpoint ) ) {
            return [ this.endpoints.get( endpoint ), endpoint, rest ];
        }
    }

    locateAll ( path : string ) : [ FileSystem, string, string ][] {
        if ( typeof path === 'string' && path.startsWith( '/' ) ) {
            path = path.slice( 1 );
        }

        if ( !path ) {
            return Array.from( this.endpoints.entries() ).map<[ FileSystem, string, string ]>( ( [ name, fs ] ) => [ fs, name, null ] );
        }

        let match = this.locate( path );

        if ( match ) {
            return [ match ];
        }
    }

    read ( file : FileRecord ) : fs.ReadStream {
        const match = this.locate( file.source );

        if ( !match ) {
            
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

    async list ( path : string = '' ) : Promise<FileRecord[]> {
        if ( !path || path == '/' ) {
            return Array.from( this.endpoints.keys() ).map( name => new FileRecord( name, name, { type: 'virtual' } ) );
        }

        let matches = this.locateAll( path );

        if ( !matches ) {
            throw new Error( 'Could not find a mounted path for ' + path );
        }

        let files : Promise<FileRecord[]>[] = [];

        for ( let match of matches ) {
            const [ fs, name, rest ] = match;

            files.push( fs.list( rest ).then( files => {
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

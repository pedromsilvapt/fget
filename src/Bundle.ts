import * as walk from 'walk';
import * as path from 'path';
import * as fs from 'fs';
import * as isFile from 'is-file';

export class FileRecord {
    source: string;
    target: string;
    stats : fs.Stats;
}

export class Bundle {
    id : string;
    files : FileRecord[];

    static async stats ( path : string ) : Promise<fs.Stats> {
        return new Promise<fs.Stats>( ( resolve, reject ) => {
            fs.stat( path, ( err, stats ) => {
                if ( err ) {
                    return reject( err );
                }

                resolve( stats );
            } );
        } );
    }

    static async walk ( string : string ) : Promise<[ string, fs.Stats ][]> {
        let stats = await Bundle.stats( string );
        
        if ( stats.isFile() ) {
            return Promise.resolve<[ string, fs.Stats ][]>( [ [ string, stats ] ] );
        }

        return new Promise<[ string, fs.Stats ][]>( ( resolve, reject ) => {
            let files : [ string, fs.Stats ][] = [];

            walk.walk( string ).on( 'files', ( root : string, stats : fs.Stats[], next : any ) => {
                files.push( ...stats.filter( stat => stat.isFile() ).map<[ string, fs.Stats ]>( stat => [ path.join( root, stat.name ), stat ] ) );

                next();
            } ).on( 'error', reject ).on( 'end', () => resolve( files ) );
        } );
    }

    static async expand ( files : string[], mainRoot : string = null ) : Promise<FileRecord[]> {
        let records : FileRecord[] = [];

        for ( let file of files ) {
            let expanded = await Bundle.walk( file );

            let root = mainRoot || path.dirname( file );

            records.push( ...expanded.map( ( [ file, stats ] ) => {
                return {
                    source: file,
                    target: path.relative( root, file ),
                    stats: stats
                };
            } ) );
        }

        return records;
    }

    constructor ( id : string, files : FileRecord[] ) {
        this.id = id;
        this.files = files;
    }

    toJSON () {
        return {
            id: this.id,
            files: this.files
        };
    }
}
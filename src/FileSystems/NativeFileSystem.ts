import { FileRecord, Bundle } from '../Bundle';
import * as path from 'path';
import * as fs from 'fs-promise';
import * as walk from 'walk';
import * as pathIsInside from 'path-is-inside';
import { FileSystem } from './FileSystem';
import { PathUtils } from '../PathUtils';

export class NativeFileSystem implements FileSystem {
    root : string;

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
        let stats = await NativeFileSystem.stats( string );
        
        if ( stats.isFile() ) {
            return Promise.resolve<[ string, fs.Stats ][]>( [ [ string, stats ] ] );
        }

        return new Promise<[ string, fs.Stats ][]>( ( resolve, reject ) => {
            let files : [ string, fs.Stats ][] = [];

            walk.walk( string ).on( 'files', ( root : string, stats : fs.Stats[], next : any ) => {
                files.push( ...stats.filter( stat => stat.isFile() ).map<[ string, fs.Stats ]>( stat => [ path.join( root, ( stat as any ).name ), stat ] ) );

                next();
            } ).on( 'error', reject ).on( 'end', () => resolve( files ) );
        } );
    }

    static async expand ( files : string[], mainRoot : string = null ) : Promise<FileRecord[]> {
        let records : FileRecord[] = [];

        for ( let target of files ) {
            let expanded = await NativeFileSystem.walk( target );

            let root = path.dirname( target );

            records.push( ...expanded.map( ( [ file, stats ] ) => {
                return FileRecord.fromFsStats( PathUtils.normalize( path.relative( mainRoot || root, file ) ), PathUtils.normalize( path.relative( target, file ) ), stats );
            } ) );
        }

        return records;
    }

    static toAbsolute ( root : string, target : string ) : string {
        const absolute = path.resolve( path.join( root, target ) );

        if ( !pathIsInside( absolute, root ) ) {
            throw new Error( `Trying to access outside of bounds.` );
        }

        return absolute;
    }

    constructor ( root : string ) {
        this.root = root;
    }

    read ( file : FileRecord ) : fs.ReadStream {
        return fs.createReadStream( NativeFileSystem.toAbsolute( this.root, file.source ) );
    }

    async fetch ( path ?: string | string[] ) : Promise<FileRecord[]> {
        path = path || '';

        if ( typeof path === 'string' ) {
            path = [ path ];
        }

        path = path.map( path => NativeFileSystem.toAbsolute( this.root, path ) );

        return NativeFileSystem.expand( path, this.root );
    }

    async list ( target : string = '' ) : Promise<FileRecord[]> {
        target = target || '';
        
        const root = NativeFileSystem.toAbsolute( this.root, target );

        const children = await fs.readdir( root );

        const buckets : FileRecord[] = [];

        for ( let child of children ) {
            buckets.push( FileRecord.fromFsStats( PathUtils.join( target, child ), child, await fs.stat( path.join( root, child ) ) ) )
        }

        return buckets;
    }

    find ( path : string ) : Promise<FileRecord[]> {
        throw new Error( 'Not implemented yet' );
    }
}

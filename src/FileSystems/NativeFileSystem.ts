import { FileRecord, Bundle } from '../Bundle';
import * as path from 'path';
import * as fs from 'fs-promise';
import * as walk from 'walk';
import * as most from 'most';
import { last } from 'most-last'
import * as pathIsInside from 'path-is-inside';
import { FileSystem, WatchEvent, mergeWatchEvents, ListOptions } from './FileSystem';
import { PathUtils } from '../PathUtils';
import * as chokidar from 'chokidar';

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

    static toRelative ( root : string, target : string ) : string {
        target = path.resolve( target );

        if ( !pathIsInside( target, root ) ) {
            throw new Error( `Trying to access outside of bounds with "${ target }" on "${ root }".` );
        }

        return path.relative( root, target );
    }

    static toFileRecord ( target : string, child : string, stats : fs.Stats ) : FileRecord {
        return FileRecord.fromFsStats( PathUtils.join( target, child ), child, stats );
    }

    constructor ( root : string ) {
        this.root = root;
    }

    protected async getFolderSize ( folder : string ) : Promise<number> {
        const files = await NativeFileSystem.walk( folder )

        const sizes = files.map( ( [ path, stats ] ) => stats.size );

        return sizes.reduce( ( sum, size ) => sum + size, 0 );
    }

    async stats ( file : string ) : Promise<fs.Stats> {
        return fs.stat( file );
    }

    /**
     * Uses chokidar to listen for changes in the filesystem in the provided path.
     * 
     * @param {string} paths 
     * @param {Promise<void>} lifetime 
     * @returns {most.Stream< WatchEvent >} 
     * 
     * @memberof NativeFileSystem
     */
    watchSingle ( paths : string, lifetime : Promise<void> ) : most.Stream< WatchEvent > {
        const watchedPath = paths;

        paths = NativeFileSystem.toAbsolute( this.root, paths )

        var watcher = chokidar.watch( paths, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            disableGlobbing: true
        } );

        const stream = most.never();

        const events : string[] = [ 'add', 'change', 'unlink', 'addDir', 'unlinkDir', 'ready' ];

        const listeners : most.Stream<WatchEvent>[] = [];

        for ( let event of events ) {
            listeners.push( most.fromEvent<[string, fs.Stats] | string>( event, watcher ).map<[ string, fs.Stats ]>( ( args : any ) => {
                if ( typeof args === 'string' ) {
                    return [ args ];
                }

                if ( !args ) {
                    return [];
                }

                return args;
            } ).map( ( [ partial, stats ] ) => {
                if ( partial ) {
                    const relative = NativeFileSystem.toRelative( paths, partial );

                    const file = NativeFileSystem.toFileRecord( watchedPath, relative, stats );

                    console.log( file );

                    return { type: event, files: [ file ] };
                } else {
                    return { type: event, files: [] };
                }
            } ) );
        }

        lifetime.then( () => watcher.close() );

        const merged = most.mergeArray( listeners );

        const ready = merged.takeWhile( event => event.type !== 'ready' ).scan<WatchEvent>( ( memo, event ) => {
                if ( event.files ) {
                    memo.files.push( ...event.files )
                }

                return memo;
            }, {
            type: 'ready',
            files: []
        } );

        return last( ready )
            .concat( merged
                // .skipWhile( event => event.type !== 'ready' ).skip( 1 )
                .until( most.fromPromise( lifetime ) ) 
            )
            .concat( most.just( { type: 'end' } ) );
    }

    /**
     * This function receives either a single path or a list of paths to be watched. Globs are not officially supported atm.
     * This function watches each path on it's own, to keep the code simpler, and then merges the stream of events all into one.
     * It emits one 'ready' event first, containing a list of the initial file structure in the array files.
     * After that it emits a sequence of events containing the type and corresponding file.
     * 
     * Note that unlink events may contain incomplete file stats data.
     * 
     * @param {(string | string[])} paths The paths belonging to this filesystem to be watched.
     * @param {Promise<void>} lifetime 
     * @returns {most.Stream<WatchEvent>} 
     * 
     * @memberof NativeFileSystem
     */
    watch ( paths : string | string[], lifetime : Promise<void> ) : most.Stream<WatchEvent> {
        paths = paths || '';

        if ( typeof paths === 'string' ) {
            paths = [ paths ];
        }

        // TODO Temp solution
        return this.watchSingle( paths[ 0 ], lifetime );

        const streams = paths.map( path => this.watchSingle( path, lifetime ) );

        return mergeWatchEvents( streams );
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

    async list ( target : string = '', options : Partial<ListOptions> = {} ) : Promise<FileRecord[]> {
        target = target || '';
        
        const root = NativeFileSystem.toAbsolute( this.root, target );

        const children = await fs.readdir( root );

        const buckets : FileRecord[] = [];

        for ( let child of children ) {
            const stats = await this.stats( path.join( root, child ) );

            const record = FileRecord.fromFsStats( PathUtils.join( target, child ), child, stats );

            buckets.push( record );

            if ( record.stats.type === 'folder' ) {
                if ( options.recursive ) {
                    const children = await this.list( PathUtils.join( target, child ), options );
                    
                    if ( options.folderSizes ) {
                        record.stats.childrenSize = children.reduce( ( s, r ) => s + r.stats.ownSize, 0 );
                    }

                    buckets.push( ...children.map( record => record.unfold( child ) ) );
                } else if ( options.folderSizes ) {
                    record.stats.childrenSize = await this.getFolderSize( path.join( root, child ) );
                }

                record.stats.size += record.stats.childrenSize;
            }
        }

        return buckets;
    }

    find ( path : string ) : Promise<FileRecord[]> {
        throw new Error( 'Not implemented yet' );
    }
}
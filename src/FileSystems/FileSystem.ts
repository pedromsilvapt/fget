import { Bundle, FileRecord } from '../Bundle';
import * as fs from 'fs-promise';
import * as path from 'path';
import * as most from 'most';
import { last } from 'most-last';
import { PathUtils } from '../PathUtils';

export interface WatchEvent {
    type: string;
    files?: FileRecord[];
}

export interface ListOptions {
    recursive: boolean;
    folderSizes: boolean;
}

export interface FileSystem {
    watch ( watch : string | string[], lifetime : Promise<void> ) : most.Stream<WatchEvent>;

    read ( file : FileRecord ) : fs.ReadStream;

    fetch ( path : string | string[] ) : Promise<FileRecord[]>;

    list ( path : string, options ?: Partial<ListOptions> ) : Promise<FileRecord[]>;

    find ( path : string ) : Promise<FileRecord[]>;
}

export function filterWatchFiles ( events : WatchEvent[], predicate : ( file : FileRecord, event : WatchEvent ) => boolean ) : WatchEvent[] {
    return events.map( event => {
        event.files = event.files.filter( file => predicate( file, event ) );

        return event;
    } ).filter( event => event.files.length > 0 );
}

export function mergeWatchEvents ( events : most.Stream<WatchEvent>[] ) : most.Stream<WatchEvent> {
    const ready = most.mergeArray( events.map( stream => stream.take( 1 ) ) ).scan<WatchEvent>( ( memo, event ) => {
            if ( event.files ) {
                memo.files = memo.files.concat( event.files );
            }

            return memo;
        }, {
        type: 'ready',
        files: []
    } );

    return last( ready ).concat( 
        most.mergeArray( events.map( stream => stream.skip( 1 ) ) ) 
    );
}

export function compactWatchEvents ( events : WatchEvent[] ) : WatchEvent[] {
    const index : Map<string, WatchEvent> = new Map();

    for ( let event of events ) {
        for ( let file of event.files ) {
            if ( !index.has( file.target ) ) {
                index.set( file.target, { type: event.type, files: [ file ] } );
            } else {
                const previous = index.get( file.target );

                previous.type = event.type;
            }
        }
    }

    const compacted : Map<string, WatchEvent> = new Map();

    for ( let file of index.values() ) {
        if ( !compacted.has( file.type ) ) {
            compacted.set( file.type, { type: file.type, files: [] } );
        }

        compacted.get( file.type ).files.push( ...file.files );
    }

    return Array.from( compacted.values() );
}

export function applyWatchEvents ( files : FileRecord[], events : WatchEvent[] ) : FileRecord[] {
    const index : Map<string, FileRecord> = new Map();

    for ( let file of files ) {
        index.set( file.target, file );
    }

    for ( let event of events ) {
        for ( let file of event.files ) {
            if ( event.type === 'unlink' ) {
                index.delete( file.target );
            } else if ( event.type === 'add' ) {
                index.set( file.target, file );
            }
        }
    }

    return Array.from( index.values() );
}
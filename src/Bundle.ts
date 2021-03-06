import * as walk from 'walk';
import * as path from 'path';
import * as fs from 'fs';
import * as isFile from 'is-file';
import { PathUtils } from "./PathUtils";
import { IDisposable } from "./Server";
import { WatchEvent } from "./FileSystems/FileSystem";

export interface RecordStats {
    type: 'file' | 'folder' | 'virtual';
    size?: number;
    ownSize?: number;
    childrenSize?: number;
    updatedAt?: number;
    createdAt?: number;
}

export class FileRecord {
    source: string;
    target: string;
    stats : RecordStats;

    static fromFsStats ( source : string, target : string, stats : fs.Stats ) {
        return new FileRecord( source, target, {
            type: stats.isFile() ? 'file' : 'folder',
            size: stats.size,
            ownSize: stats.size,
            childrenSize: 0,
            updatedAt: stats.mtime.valueOf() as any as number,
            createdAt: stats.atime.valueOf() as any as number
        } );
    }

    constructor ( source : string, target : string, stats : RecordStats ) {
        this.source = source;
        this.target = target;
        this.stats = stats;
    }

    clone () {
        return new FileRecord( this.source, this.target, this.stats );
    }

    fold ( changeTarget : boolean = true ) : FileRecord {
        if ( changeTarget ) {        
            this.target = PathUtils.fold( this.target );
        }

        this.source = PathUtils.fold( this.source );

        return this;
    }

    unfold ( segment : string, changeTarget : boolean = true ) : FileRecord {
        if ( changeTarget ) {
            this.target = PathUtils.unfold( this.target, segment );
        }
        
        this.source = PathUtils.unfold( this.source, segment );

        return this;
    }
}

export class Bundle {
    id : string;
    files : FileRecord[];

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

export class BundleDisposable implements IDisposable {
    bundlesCollection : Map<string, Bundle>;
    bundle : Bundle;

    constructor ( bundles : Map<string, Bundle>, bundle : Bundle ) {
        this.bundlesCollection = bundles;
        this.bundle = bundle;
    }

    equals ( obj : IDisposable ) : boolean {
        if ( obj instanceof BundleDisposable ) {
            return this.bundlesCollection == obj.bundlesCollection && this.bundle == obj.bundle;
        }
    }

    dispose () {
        this.bundlesCollection.delete( this.bundle.id );
    }
}
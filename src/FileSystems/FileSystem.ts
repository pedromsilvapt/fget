import { Bundle, FileRecord } from "../Bundle";
import * as fs from 'fs-promise';
import * as path from 'path';
import { PathUtils } from "../PathUtils";

export interface FileSystem {
    read ( file : FileRecord ) : fs.ReadStream;

    fetch ( path : string | string[] ) : Promise<FileRecord[]>;

    list ( path : string ) : Promise<FileRecord[]>;

    find ( path : string ) : Promise<FileRecord[]>;
}

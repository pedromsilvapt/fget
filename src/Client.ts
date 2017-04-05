import * as SocketClient from 'socket.io-client';
import * as Queue from 'promise-queue';
import * as fs from 'fs-promise';
import * as path from 'path';
import * as got from 'got';
import { Server } from "./Server";
import { FileRecord } from "./Bundle";
import { ProgressReporter, IProgressReporter, Progress, ProgressBar } from "./ProgressReporter";
import { Sockets } from "./Sockets";
import { PathUtils } from "./PathUtils";


export class Client {
    source : string;

    socket : SocketIOClient.Socket;

    concurrency : number = 1;

    workingDirectory : string = '/';

    constructor ( source : string ) {
        this.source = source;

        this.socket = SocketClient( source );
    }

    resolve ( path : string ) {
        path = ( path || '' );
        if ( path.startsWith( '/' ) ) {
            return path;
        } else {
            return PathUtils.resolve( PathUtils.join( this.workingDirectory, path ) );
        }
    }

    async downloadFile ( targetFolder : string, bundle : IBundleMessage, fileId : number, file : FileRecord, reporter ?: ProgressReporter ) {
        let target = path.join( targetFolder, file.target || path.basename( file.source ) );

        await fs.ensureDir( path.dirname( target ) );

        let source = this.source + '/bundles/' + bundle.id + '/'  + fileId;

        return new Promise( ( resolve, reject ) => {
            if ( reporter ) {
                reporter.fileStarted( bundle, file );
            }

            got.stream( source ).on( 'data', ( data : any ) => {
                let length : number = 0;

                if ( typeof data === 'string' ) {
                    length = data.length
                } else if ( Buffer.isBuffer( data ) ) {
                    length = data.byteLength;
                }

                if ( reporter ) {
                    reporter.progress( bundle, file, length );
                }
            } ).pipe( fs.createWriteStream( target ) ).on( 'finish', () => {
                if ( reporter ) {
                    reporter.fileFinished( bundle, file );
                }
                resolve( target );
            } );
        } );
    }

    async download ( target : string, path : string = null, reporter ?: Partial<IProgressReporter> ) {
        let proxy : ProgressReporter;

        if ( reporter ) {
            proxy = new ProgressReporter( reporter );
        }

        path = this.resolve( path );

        let bundle = await Sockets.emit<IBundleMessage>( this.socket, 'command', { name: 'fetch', path: path } );

        let downloads : Promise<void>[] = [];

        let queue = new Queue( this.concurrency, Infinity );

        if ( proxy ) {
            proxy.bundleStarted( bundle );
        }

        for ( let [ index, file ] of bundle.files.entries() ) {
            downloads.push( 
                queue.add( 
                    () => this.downloadFile( target, bundle, index, file, proxy )
                ) 
            );
        }

        await Promise.all( downloads );
        
        if ( proxy ) {
            proxy.bundleFinished( bundle );
        }
    }

    async list ( path : string ) : Promise<IListMessage> {
        path = this.resolve( path );

        return Sockets.emit<IListMessage>( this.socket, 'command', { name: 'list', path: path } );
    }
}

export interface IBundleMessage {
    id: string;
    files: FileRecord[]
}

export interface IListMessage {
    files: FileRecord[]
}
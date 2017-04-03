import * as SocketClient from 'socket.io-client';
import * as internalIp from 'internal-ip';
import * as Queue from 'promise-queue';
import * as fs from 'fs-promise';
import * as path from 'path';
import * as got from 'got';
import { Server } from "./Server";
import { FileRecord } from "./Bundle";
import { ProgressReporter, IProgressReporter, Progress, ProgressBar } from "./ProgressReporter";
import { Sockets } from "./Sockets";


export class Client {
    target : string;

    source : string;

    socket : SocketIOClient.Socket;

    bundle : IBundleMessage;

    concurrency : number = 1;

    constructor ( target : string, source : string ) {
        this.target = target;

        this.source = source;

        this.socket = SocketClient( source );
    }

    async downloadFile ( bundle : IBundleMessage, fileId : number, file : FileRecord, reporter ?: ProgressReporter ) {
        let target = path.join( this.target, file.target || path.basename( file.source ) );

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

    async download ( path : string = null, reporter ?: Partial<IProgressReporter> ) {
        let proxy : ProgressReporter;

        if ( reporter ) {
            proxy = new ProgressReporter( reporter );
        }

        this.socket.emit( 'command', { name: 'fetch', ip: internalIp.v4(), path: path } );

        let bundle = await Sockets.emit<IBundleMessage>( this.socket, 'command', { name: 'fetch', ip: internalIp.v4(), path: path } );

        let downloads : Promise<void>[] = [];

        let queue = new Queue( this.concurrency, Infinity );

        if ( proxy ) {
            proxy.bundleStarted( bundle );
        }

        for ( let [ index, file ] of bundle.files.entries() ) {
            downloads.push( 
                queue.add( 
                    () => this.downloadFile( bundle, index, file, proxy )
                ) 
            );
        }

        await Promise.all( downloads );
        
        if ( proxy ) {
            proxy.bundleFinished( this.bundle );
        }

        // return new Promise<void>( ( resolve, reject ) => {
        //     this.socket.on( 'bundle', async ( data : IBundleMessage ) => {
        //         this.bundle = data;

        //         let downloads : Promise<void>[] = [];

        //         let queue = new Queue( this.concurrency, Infinity );

        //         if ( proxy ) {
        //             proxy.bundleStarted( this.bundle );
        //         }

        //         for ( let [ index, file ] of this.bundle.files.entries() ) {
        //             downloads.push( 
        //                 queue.add( 
        //                     () => this.downloadFile( this.bundle, index, file, proxy )
        //                 ) 
        //             );
        //         }

        //         await Promise.all( downloads );
                
        //         if ( proxy ) {
        //             proxy.bundleFinished( this.bundle );
        //         }

        //         resolve();
        //     } );
        // } );
    }
}

export interface IBundleMessage {
    id: string;
    files: FileRecord[]
}

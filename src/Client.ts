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
import { ClientTransportsManager } from "./Transports/TransportsManager";
import { ClientTransport } from "./Transports/Transport";
import { HttpClientTransport } from "./Transports/HttpTransport";


export class Client {
    source : string;

    socket : SocketIOClient.Socket;

    concurrency : number = 1;

    workingDirectory : string = '/';

    workingLocalDirectory : string = process.cwd();

    transports : ClientTransportsManager = new ClientTransportsManager();

    constructor ( source : string ) {
        this.source = source;

        this.socket = SocketClient( source );

        this.transports.add( 'http', new HttpClientTransport() );

        this.transports.setup( this );

        this.transports.defaultTransport = 'http';
    }

    resolve ( path : string = '' ) {
        if ( !path ) {
            return this.workingDirectory;
        }

        if ( path.startsWith( '/' ) ) {
            return PathUtils.normalize( path );
        } else {
            return PathUtils.resolve( PathUtils.join( this.workingDirectory, path ) );
        }
    }

    resolveLocal ( string : string = '' ) {
        if ( !string ) {
            return this.workingLocalDirectory;
        }

        if ( path.isAbsolute( string ) ) {
            return path.normalize( string );
        } else {
            return path.resolve( path.join( this.workingLocalDirectory, string ) );
        }
    }

    async downloadFile ( targetFolder : string, bundle : IBundleMessage, file : FileRecord, transport : ClientTransport, reporter ?: ProgressReporter ) {
        let target = path.join( this.resolveLocal( targetFolder ), file.target || path.basename( file.source ) );

        await fs.ensureDir( path.dirname( target ) );

        return new Promise( async ( resolve, reject ) => {
            if ( reporter ) {
                reporter.fileStarted( bundle, file );
            }

            ( await transport.fetch( bundle, file ) ).on( 'data', ( data : any ) => {
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

    async download ( target : string, path : string = null, transportName ?: string, reporter ?: Partial<IProgressReporter> ) {
        let proxy : ProgressReporter;

        if ( reporter ) {
            proxy = new ProgressReporter( reporter );
        }
        
        const transport = this.transports.getOrDefault( transportName );

        if ( !transport ) {
            throw new Error( `Could not find a transport named "${ transportName }"` );
        }

        path = this.resolve( path );

        let bundle = await Sockets.emit<IBundleMessage>( this.socket, 'command', { name: 'fetch', path: path, transport: transportName } );

        let downloads : Promise<void>[] = [];

        let queue = new Queue( this.concurrency, Infinity );

        if ( proxy ) {
            proxy.bundleStarted( bundle );
        }

        for ( let [ index, file ] of bundle.files.entries() ) {
            downloads.push( 
                queue.add( 
                    () => this.downloadFile( target, bundle, file, transport, proxy )
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
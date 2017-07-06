import * as SocketClient from 'socket.io-client';
import * as Queue from 'promise-queue';
import * as fs from 'fs-promise';
import * as path from 'path';
import * as got from 'got';
import * as most from 'most';
import { Server, WatchCommandResponse } from "./Server";
import { FileRecord } from "./Bundle";
import { ProgressReporter, IProgressReporter, Progress, ProgressBar } from "./ProgressReporter";
import { Sockets } from "./Sockets";
import { PathUtils } from "./PathUtils";
import { ClientTransportsManager } from "./Transports/TransportsManager";
import { ClientTransport } from "./Transports/Transport";
import { HttpClientTransport } from "./Transports/HttpTransport";
import { WatchEvent, ListOptions } from "./FileSystems/FileSystem";


export class Client {
    source : string;

    socket : SocketIOClient.Socket;

    concurrency : number = 1;

    workingDirectory : string = '/';

    workingLocalDirectory : string = process.cwd();

    transports : ClientTransportsManager = new ClientTransportsManager();

    watchers : WatcherServer;

    constructor ( source : string ) {
        this.source = source;

        this.socket = SocketClient( source );

        this.transports.add( 'http', new HttpClientTransport() );

        this.transports.setup( this );

        this.transports.defaultTransport = 'http';

        this.watchers = new WatcherServer( this.socket );
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

    async downloadFile ( targetFolder : string, bundle : IBundleMessage, file : FileRecord, overwrite : boolean, transport : ClientTransport, reporter ?: ProgressReporter ) {
        let target = path.join( this.resolveLocal( targetFolder ), file.target || path.basename( file.source ) );

        await fs.ensureDir( path.dirname( target ) );

        if ( !overwrite && await fs.exists( file.target ) ) {
            return target;
        }

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

    async downloadBundle ( bundle : IBundleMessage, target : string, overwrite : boolean, transport : ClientTransport, proxy ?: ProgressReporter ) {
        let downloads : Promise<void>[] = [];

        let queue = new Queue( this.concurrency, Infinity );

        if ( proxy ) {
            proxy.bundleStarted( bundle );
        }

        for ( let [ index, file ] of bundle.files.entries() ) {
            downloads.push( 
                queue.add( 
                    () => this.downloadFile( target, bundle, file, overwrite, transport, proxy )
                ) 
            );
        }

        await Promise.all( downloads );

        if ( proxy ) {
            proxy.bundleFinished( bundle );
        }
    }

    async download ( target : string, path : string = null, overwrite : boolean, watch : boolean, transportName ?: string, reporter ?: Partial<IProgressReporter> ) {
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

        await this.downloadBundle( bundle, target, overwrite, transport, proxy );

        if ( watch ) {
            await this.watchers.watch( path ).map( bundle => {
                console.log( bundle );

                return this.downloadBundle( bundle, target, overwrite, transport, proxy );
            } ).await().forEach( x => x );
        }
    }

    async list ( path : string, options : Partial<ListOptions> = {} ) : Promise<IListMessage> {
        path = this.resolve( path );

        return Sockets.emit<IListMessage>( this.socket, 'command', { name: 'list', path: path, recursive: options.recursive, folderSizes: options.folderSizes } );
    }
}

export interface IBundleMessage {
    id: string;
    files: FileRecord[]
}

export interface IListMessage {
    files: FileRecord[]
}

export class WatcherServer {
    socket : SocketIOClient.Socket;

    events : most.Stream<WatchCommandResponse>;

    constructor ( socket : SocketIOClient.Socket ) {
        this.socket = socket;
    }

    listen ( id : string ) : most.Stream<IBundleMessage> {
        if ( !this.events ) {
            this.events = most.fromEvent<WatchCommandResponse>( 'watch', this.socket ).multicast();
        }

        return this.events.tap( console.log.bind( console ) ).filter( event => event.id === id ).map( event => event.bundle );
    }

    watch ( files : string, transport ?: string ) : most.Stream<IBundleMessage> {
        const response = Sockets.emit<WatchCommandResponse>( this.socket, 'command', { name: 'watch', files, transport } );

        // response.then( console.log.bind( console, 1, 2 ) ).catch( console.error.bind( console, 'ERROR' ) );

        return most.fromPromise( response ).flatMap( message => this.listen( message.id ) );
    }
}
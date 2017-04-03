// import * as socket from 'socket.io';

export class Sockets {
    static emit<R> ( socket : SocketIO.Socket | SocketIOClient.Socket, event : string, args : any ) : Promise<R> {
        return new Promise<R>( ( resolve, reject ) => {
            ( socket as SocketIO.Socket ).emit( event, args, ( result : SocketResponse<R> ) => {
                if ( result.error ) {
                    return reject( result.error );
                }

                resolve( result.result );
            } );
        } );
    }

    static on ( socket : SocketIO.Socket | SocketIOClient.Socket, event : string, listener : Function ) {
        ( socket as SocketIO.Socket ).on( event, async ( args : any, fn : ( ( res : SocketResponse<any> ) => void ) ) => {
            try {
                let result = await Promise.resolve( listener( args ) );

                fn( { result } );
            } catch ( error ) {
                console.error( error );
                
                fn( { error } );
            }
        } );
    }
}

export interface SocketResponse<R> {
    error ?: any;
    result ?: R
}
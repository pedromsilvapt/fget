import { Client, IListMessage } from "../../Client";
import { FileRecord } from "../../Bundle";
import { PathUtils } from "../../PathUtils";

export interface Predicate<T> {
    ( value : T ) : boolean
}

export function AutoComplete( client: Client, predicate ?: Predicate<FileRecord> ) {
    return async ( partial : string, callback : Function ) => {
        const parts = PathUtils.explode( partial );
        
        const len = parts.length;

        const folder = partial.endsWith( '/' ) ? partial : PathUtils.join( ...parts.slice( 0, len - 1 ) );

        const results = await client.list( folder ).catch( () => ( { files: [] } as IListMessage ) );

        let files = results.files
            .filter( record => predicate ? predicate( record ) : true )
            .map( r => r.target + ( r.stats.type != 'file' ? '/' : '' ) );

        callback( files );
    };
}

export interface ILogger {
    log ( ...args : any[] ) : void;
}

export class View {
    logger : ILogger;

    constructor ( logger : ILogger ) {
        this.logger = logger;
    }

    throw ( error : any ) : void {
        console.error( error );
    }
}

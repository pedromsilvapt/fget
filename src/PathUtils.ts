import * as path from 'path';

export class PathUtils {
    static normalize ( path : string ) : string {
        path = path.replace( /\\/g, '/' );

        if ( path.startsWith( '/' ) ) {
            path = path.slice( 1 );
        }

        if ( path.endsWith( '/' ) ) {
            path = path.slice( 0, path.length - 1 );
        }

        return path;
    }

    static join ( ...segments : string[] ) {
        return segments.map( segment => PathUtils.normalize( segment ) ).join( '/' );
    }

    static explode ( path : string, limit : number = Infinity ) : string[] {
        path = PathUtils.normalize( path );

        if ( path.startsWith( '/' ) ) {
            path = path.slice( 1 );
        }

        const parts = path.split( '/' );

        if ( parts.length <= limit ) {
            return parts;
        }

        return parts.slice( 0, limit - 1 ).concat( [ parts.slice( limit - 1 ).join( '/' ) ] )
        // return path.split( '/', limit );
    }

    static fold ( path : string ) : string {
        return PathUtils.explode( path, 2 )[ 1 ] || '';
    }

    static unfold ( path : string, segment : string ) : string {
        return PathUtils.join( segment, path );
    }

    static dirname ( string : string ) {
        return path.dirname( string );
    }
}
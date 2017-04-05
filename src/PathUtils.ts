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

    static dirname ( string : string ) : string {
        return path.dirname( string );
    }

    static resolve ( string : string ) : string {
        let parts = PathUtils.explode( string );

        let back : number = 0;
        let regenerated : string[] = [];

        for ( let part of parts ) {
            if ( part === '..' ) {
                if ( !regenerated.length || back > 0 ) {
                    back += 1;
                }
                
                if ( regenerated.length ) {
                    regenerated.pop();
                }
            } else if ( part !== '.' ) {
                if ( back > 0 ) {
                    back -= 1;
                }

                regenerated.push( part );
            }
        }

        return '../'.repeat( back ) + regenerated.join( '/' );
        // return regenerated.join( '/' );
    }
}
import * as ip from 'ip';

export enum InternetProtocolVersion {
    Version4 = 4,
    Version6 = 6
}

export class InternetProtocol {
    static address () : string {
        return ip.address();
    }

    static isEqual ( addr1 : string, addr2: string ) : boolean {
        return ip.isEqual( addr1, addr2 );
    }

    static allowed ( addr : string, whitelist : string[] ) {
        addr = InternetProtocol.normalize( addr );

        whitelist = whitelist.map( ip => InternetProtocol.normalize( addr ) );

        return whitelist.some( line => InternetProtocol.isEqual( line, addr ) );
    }

    static normalize ( addr : string ) {
        if ( addr.startsWith( '::ffff:' ) ) {
            addr = addr.slice( 7 );
        }

        if ( addr === '127.0.0.1' || addr === 'localhost' ) {
            addr = InternetProtocol.address();
        }

        return addr;
    }

    static isVersion4 ( addr : string ) : boolean {
        return ip.isV4Format( addr );
    }

    static isVersion6 ( addr : string ) : boolean {
        return ip.isV6Format( addr );
    }

    static version ( addr : string ) : InternetProtocolVersion {
        if ( InternetProtocol.isVersion4( addr ) ) {
            return InternetProtocolVersion.Version4;
        } else if ( InternetProtocol.isVersion6( addr ) ) {
            return InternetProtocolVersion.Version6;
        }

        return null;
    }
}
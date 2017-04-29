import { Transport, ClientTransport, ServerTransport } from "./Transport";
import { Server } from "../Server";
import { Client } from "../Client";

export class TransportsManager<T extends Transport<D>, D> {
    defaultTransport : string;

    transports : Map<string, T> = new Map();

    add ( name : string, transport : T ) {
        this.transports.set( name, transport );
    }

    get ( name : string ) : T {
        return this.transports.get( name );
    }

    getOrDefault ( name ?: string ) : T {
        return this.get( name || this.defaultTransport );
    }

    setup ( device : D ) {
        for ( let transport of this.transports.values() ) {
            if ( transport.setup ) {
                transport.setup( device );
            }
        }
    }
}

export class ClientTransportsManager extends TransportsManager<ClientTransport, Client> { }

export class ServerTransportsManager extends TransportsManager<ServerTransport, Server> { }
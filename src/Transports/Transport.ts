import { Client, IBundleMessage } from "../Client";
import { Server } from "../Server";
import { Bundle, FileRecord } from "../Bundle";
import * as stream from 'stream';

export interface Transport<T> {
    setup ? ( device : T ) : void;
}

export interface ClientTransport extends Transport<Client> {
    fetch ( bundle : IBundleMessage, file : FileRecord ) : Promise<stream.Readable>;
}

export interface ServerTransport extends Transport<Server> {
    serve ? ( bundle : Bundle ) : void;
}
import { IBundleMessage } from "./Client";
import { FileRecord } from "./Bundle";

export interface Progress {
    total: number;
    done: number;
    percentage: number;
    timeElapsed: number;
    timeRemaining: number;
    speed: number;
}

export class ProgressFactory {
    progress: Progress;
    startedAt: number;

    constructor ( total : number ) {
        this.progress = {
            done: 0,
            total: total,
            percentage: 0,
            timeElapsed: 0,
            timeRemaining: 0,
            speed: 0
        }

        this.startedAt = Date.now();
    }

    update ( increment : number ) : Progress {
        this.progress.done += increment;

        this.progress.timeElapsed = ( Date.now() - this.startedAt ) / 1000;

        // Calculate speed only if 1s has passed
        if (this.progress.timeElapsed >= 1) {
            this.progress.speed = this.progress.done / this.progress.timeElapsed;
        }

        // Calculate percent & remaining only if we know the total size
        if (this.progress.total != null) {
            this.progress.percentage = Math.min( this.progress.done, this.progress.total ) / this.progress.total;

            if (this.progress.speed != null) {
                this.progress.timeRemaining = this.progress.percentage !== 1 ? ( this.progress.total / this.progress.speed ) - this.progress.timeElapsed : 0;
                this.progress.timeRemaining = Math.round( this.progress.timeRemaining * 1000 ) / 1000;  // Round to 4 decimals
            }
        }

        return this.progress;
    }

    finish () : Progress {
        return this.update( this.progress.total - this.progress.done );
    }
}

export interface IProgressReporter {
    bundleStarted ( bundle : IBundleMessage ) : void;
    bundleProgress ( bundle : IBundleMessage, stats : Progress ) : void;
    bundleFinished ( bundle : IBundleMessage, stats : Progress ) : void;

    fileStarted ( bundle : IBundleMessage, file : FileRecord ) : void;
    fileProgress ( bundle : IBundleMessage, file : FileRecord, stats : Progress ) : void;
    fileFinished ( bundle : IBundleMessage, file : FileRecord, stats : Progress ) : void;
}

export class ProgressReporter {
    proxy : Partial<IProgressReporter>;

    bundleStats : ProgressFactory;

    filesStats : Map<string, ProgressFactory> = new Map();

    constructor ( proxy : Partial<IProgressReporter> ) {
        this.proxy = proxy;
    }

    bundleStarted ( bundle : IBundleMessage ) : void {
        let total = bundle.files.map( file => file.stats.size ).reduce( ( a, s ) => a + s, 0 );

        this.bundleStats = new ProgressFactory( total );

        if ( this.proxy.bundleStarted ) {
            this.proxy.bundleStarted( bundle );
        }
    }

    bundleFinished ( bundle : IBundleMessage ) : void {
        if ( this.proxy.bundleFinished ) {
            this.proxy.bundleFinished( bundle, this.bundleStats.finish() );
        }
    }

    progress ( bundle : IBundleMessage, file : FileRecord, increment : number ) {
        if ( this.proxy.bundleProgress ) {
            this.proxy.bundleProgress( bundle, this.bundleStats.update( increment ) );
        }

        if ( this.proxy.fileProgress ) {
            const stats = this.filesStats.get( file.source );

            this.proxy.fileProgress( bundle, file, stats.update( increment ) );
        }
    }

    fileStarted ( bundle : IBundleMessage, file : FileRecord ) {
        this.filesStats.set( file.source, new ProgressFactory( file.stats.size ) );

        if ( this.proxy.fileStarted ) {
            this.proxy.fileStarted( bundle, file );
        }
    }

    fileFinished ( bundle : IBundleMessage, file : FileRecord ) {
        if ( this.proxy.fileFinished ) {
            const stats = this.filesStats.get( file.source );
            
            this.proxy.fileFinished( bundle, file, stats.finish() );
        }
    }
}

export class ProgressBar {
    static pattern ( pattern : string, length : number ) : string {
        if ( length === 0 ) {
            return '';
        }

        let q : number, r : number;

        q = Math.floor( length / pattern.length );

        r = length % pattern.length;

        return pattern.repeat( q ) + pattern.slice( 0, r );
    }

    static render ( progress : Progress, width : number ) : string {
        let actualWidth = width - 2;

        const doneSize : number = Math.round( progress.done * actualWidth / progress.total );

        const remainingSize : number = actualWidth - doneSize;

        let steps : string = ProgressBar.pattern( '=', doneSize ) + ProgressBar.pattern( ' ', remainingSize );

        return '[' + steps + ']'
    }
}
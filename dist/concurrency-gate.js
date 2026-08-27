import { ProcessExecutionError } from './process-runner.js';
export class ConcurrencyGate {
    limit;
    maxQueued;
    active = 0;
    queue = [];
    disposed = false;
    constructor(limit, maxQueued){
        this.limit = limit;
        this.maxQueued = maxQueued;
    }
    get activeCount() {
        return this.active;
    }
    get queuedCount() {
        return this.queue.length;
    }
    async acquire(signal) {
        if (this.disposed) throw new ProcessExecutionError('DISPOSED', 'concurrency gate is disposed');
        if (signal?.aborted === true) throw new ProcessExecutionError('CANCELLED', 'Tool Call was cancelled while queued');
        if (this.active < this.limit) return this.admit();
        if (this.queue.length >= this.maxQueued) {
            throw new ProcessExecutionError('BACKPRESSURE', `Bridge queue limit of ${this.maxQueued} was reached`);
        }
        return await new Promise((resolve, reject)=>{
            const waiter = {
                resolve,
                reject,
                signal,
                onAbort: ()=>{
                    const index = this.queue.indexOf(waiter);
                    if (index >= 0) this.queue.splice(index, 1);
                    reject(new ProcessExecutionError('CANCELLED', 'Tool Call was cancelled while queued'));
                }
            };
            this.queue.push(waiter);
            signal?.addEventListener('abort', waiter.onAbort, {
                once: true
            });
            if (signal?.aborted === true) waiter.onAbort();
        });
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        for (const waiter of this.queue.splice(0)){
            waiter.signal?.removeEventListener('abort', waiter.onAbort);
            waiter.reject(new ProcessExecutionError('DISPOSED', 'concurrency gate disposed while call was queued'));
        }
    }
    admit() {
        this.active += 1;
        let released = false;
        return ()=>{
            if (released) return;
            released = true;
            this.active -= 1;
            while(!this.disposed && this.active < this.limit && this.queue.length > 0){
                const waiter = this.queue.shift();
                waiter.signal?.removeEventListener('abort', waiter.onAbort);
                if (waiter.signal?.aborted === true) continue;
                waiter.resolve(this.admit());
            }
        };
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/concurrency-gate.ts
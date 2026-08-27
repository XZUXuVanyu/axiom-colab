import { ProcessExecutionError, ProcessRunner } from './process-runner.js';
import { parseDescribeToolsResponse } from './protocol.js';
export class DescriptorLoader {
    runner;
    bridge;
    limits;
    observer;
    constructor(runner, bridge, limits, observer){
        this.runner = runner;
        this.bridge = bridge;
        this.limits = limits;
        this.observer = observer;
    }
    async load(signal) {
        try {
            const process = await this.runner.run(this.bridge.executable, {
                ...this.limits,
                args: [
                    ...this.bridge.prefixArgs,
                    '--describe-tools'
                ],
                cwd: this.bridge.cwd,
                signal
            });
            this.observer.diagnostic('describe-tools', process.stderr);
            return parseDescribeToolsResponse(process.stdout).tools;
        } catch (error) {
            if (error instanceof ProcessExecutionError) {
                this.observer.diagnostic('describe-tools', error.stderr);
            }
            throw error;
        }
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/descriptor-loader.ts
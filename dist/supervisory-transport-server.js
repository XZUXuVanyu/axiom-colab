import { StringDecoder } from 'node:string_decoder';
import { SUPERVISORY_TRANSPORT_VERSION } from './supervisory-transport.js';
function oversizedResponse() {
    return JSON.stringify({
        protocolVersion: SUPERVISORY_TRANSPORT_VERSION,
        id: null,
        ok: false,
        error: {
            code: 'REQUEST_TOO_LARGE',
            message: 'request line exceeds the transport process limit'
        }
    });
}
async function writeLine(output, value) {
    if (output.write(`${value}\n`)) return;
    await new Promise((resolve, reject)=>{
        output.once('drain', resolve);
        output.once('error', reject);
    });
}
export async function runSupervisoryTransportServer(transport, input = process.stdin, output = process.stdout, options = {}) {
    const maxLineBytes = options.maxLineBytes ?? 64 * 1024;
    if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes < 256) throw new Error('maxLineBytes must be a safe integer of at least 256');
    const decoder = new StringDecoder('utf8');
    let pending = '';
    let discardingOversizedLine = false;
    try {
        for await (const chunk of input){
            pending += decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            while(true){
                const newline = pending.indexOf('\n');
                if (newline < 0) break;
                const line = pending.slice(0, newline).replace(/\r$/, '');
                pending = pending.slice(newline + 1);
                if (discardingOversizedLine) {
                    discardingOversizedLine = false;
                    continue;
                }
                if (Buffer.byteLength(line, 'utf8') > maxLineBytes) await writeLine(output, oversizedResponse());
                else if (line.length > 0) await writeLine(output, await transport.handle(line));
            }
            if (!discardingOversizedLine && Buffer.byteLength(pending, 'utf8') > maxLineBytes) {
                await writeLine(output, oversizedResponse());
                pending = '';
                discardingOversizedLine = true;
            }
        }
        pending += decoder.end();
        if (!discardingOversizedLine && pending.length > 0) {
            if (Buffer.byteLength(pending, 'utf8') > maxLineBytes) await writeLine(output, oversizedResponse());
            else await writeLine(output, await transport.handle(pending.replace(/\r$/, '')));
        }
    } catch (error) {
        options.diagnostic?.(error instanceof Error ? error.message : String(error));
        throw error;
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/supervisory-transport-server.ts
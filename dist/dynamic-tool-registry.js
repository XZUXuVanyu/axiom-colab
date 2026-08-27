import { projectHarnessOutputSchema } from './harness-contract.js';
export { HarnessContractError, projectHarnessOutputSchema } from './harness-contract.js';
function renderJson(value) {
    return JSON.stringify(value, null, 2);
}
export function createHarnessToolDefinition(descriptor, service) {
    const description = [
        descriptor.description,
        `When to use: ${descriptor.whenToUse}`,
        descriptor.sideEffect ? 'Side effects: this capability declares side effects.' : 'Side effects: none declared.'
    ].join('\n');
    return {
        name: descriptor.name,
        description,
        parameters: descriptor.parameters,
        output: {
            schema: projectHarnessOutputSchema(descriptor.output),
            render: (_args, value)=>[
                    {
                        type: 'text',
                        text: renderJson(value)
                    }
                ]
        },
        timeoutMs: descriptor.timeoutMs,
        isConcurrencySafe: ()=>descriptor.allowParallel,
        sideEffect: descriptor.sideEffect,
        async execute (args, execution) {
            return await service.invoke(descriptor.name, args, String(execution.callId), execution.signal);
        }
    };
}
export function registerDynamicTools(registry, descriptors, service) {
    const rollback = [];
    try {
        for (const descriptor of descriptors){
            rollback.push(registry.register(createHarnessToolDefinition(descriptor, service)));
        }
        return rollback.length;
    } catch (error) {
        for (const dispose of rollback.reverse()){
            try {
                dispose();
            } catch  {}
        }
        throw error;
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/dynamic-tool-registry.ts
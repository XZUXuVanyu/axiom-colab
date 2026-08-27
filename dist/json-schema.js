const supportedKeywords = new Set([
    '$schema',
    '$id',
    'title',
    'description',
    'default',
    'examples',
    'deprecated',
    'readOnly',
    'writeOnly',
    'format',
    'type',
    'enum',
    'const',
    'properties',
    'required',
    'additionalProperties',
    'minProperties',
    'maxProperties',
    'items',
    'minItems',
    'maxItems',
    'uniqueItems',
    'minLength',
    'maxLength',
    'pattern',
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
    'allOf',
    'anyOf',
    'oneOf',
    'not'
]);
const supportedTypes = new Set([
    'null',
    'boolean',
    'integer',
    'number',
    'string',
    'array',
    'object'
]);
export class JsonSchemaDefinitionError extends Error {
    constructor(path, message){
        super(`${path}: ${message}`);
        this.name = 'JsonSchemaDefinitionError';
    }
}
function fail(path, message) {
    throw new JsonSchemaDefinitionError(path, message);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isSchema(value) {
    return typeof value === 'boolean' || isRecord(value);
}
function assertNonnegativeInteger(value, path) {
    if (!Number.isInteger(value) || value < 0) {
        fail(path, 'must be a non-negative integer');
    }
}
function assertSchemaArray(value, path) {
    if (!Array.isArray(value) || value.length === 0) {
        fail(path, 'must be a non-empty array of schemas');
    }
    value.forEach((item, index)=>assertSupportedJsonSchema(item, `${path}[${index}]`));
}
function assertType(value, path) {
    const values = typeof value === 'string' ? [
        value
    ] : value;
    if (!Array.isArray(values) || values.length === 0) {
        fail(path, 'must be a type string or non-empty type array');
    }
    const seen = new Set();
    values.forEach((item, index)=>{
        const itemPath = typeof value === 'string' ? path : `${path}[${index}]`;
        if (typeof item !== 'string' || !supportedTypes.has(item)) {
            fail(itemPath, 'contains an unknown JSON type');
        }
        if (seen.has(item)) fail(itemPath, 'contains a duplicate JSON type');
        seen.add(item);
    });
}
function compareCardinality(object, minimumKey, maximumKey, path) {
    const minimum = object[minimumKey];
    const maximum = object[maximumKey];
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
        fail(path, `${minimumKey} must not exceed ${maximumKey}`);
    }
}
export function assertSupportedJsonSchema(schema, path = '$') {
    if (typeof schema === 'boolean') return;
    if (!isRecord(schema)) fail(path, 'schema must be an object or boolean');
    for (const [keyword, value] of Object.entries(schema)){
        const keywordPath = `${path}.${keyword}`;
        if (!supportedKeywords.has(keyword)) {
            fail(keywordPath, 'keyword is not supported by protocol 1.0');
        }
        if (keyword === 'type') {
            assertType(value, keywordPath);
        } else if (keyword === 'enum') {
            if (!Array.isArray(value) || value.length === 0) {
                fail(keywordPath, 'must be a non-empty array');
            }
        } else if (keyword === 'properties') {
            if (!isRecord(value)) fail(keywordPath, 'must be an object');
            for (const [name, child] of Object.entries(value)){
                assertSupportedJsonSchema(child, `${keywordPath}.${name}`);
            }
        } else if (keyword === 'required') {
            if (!Array.isArray(value)) fail(keywordPath, 'must be an array of unique strings');
            const seen = new Set();
            value.forEach((item, index)=>{
                if (typeof item !== 'string' || seen.has(item)) {
                    fail(`${keywordPath}[${index}]`, 'must be a unique string');
                }
                seen.add(item);
            });
        } else if (keyword === 'additionalProperties' || keyword === 'items' || keyword === 'not') {
            if (!isSchema(value)) fail(keywordPath, 'must be a schema');
            assertSupportedJsonSchema(value, keywordPath);
        } else if (keyword === 'allOf' || keyword === 'anyOf' || keyword === 'oneOf') {
            assertSchemaArray(value, keywordPath);
        } else if (keyword === 'minProperties' || keyword === 'maxProperties' || keyword === 'minItems' || keyword === 'maxItems' || keyword === 'minLength' || keyword === 'maxLength') {
            assertNonnegativeInteger(value, keywordPath);
        } else if (keyword === 'minimum' || keyword === 'maximum' || keyword === 'exclusiveMinimum' || keyword === 'exclusiveMaximum' || keyword === 'multipleOf') {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                fail(keywordPath, 'must be a finite number');
            }
            if (keyword === 'multipleOf' && value <= 0) {
                fail(keywordPath, 'must be greater than zero');
            }
        } else if (keyword === 'pattern') {
            if (typeof value !== 'string') fail(keywordPath, 'must be a string');
            try {
                new RegExp(value);
            } catch (error) {
                fail(keywordPath, `invalid ECMAScript regex: ${error instanceof Error ? error.message : String(error)}`);
            }
        } else if (keyword === 'uniqueItems' || keyword === 'deprecated' || keyword === 'readOnly' || keyword === 'writeOnly') {
            if (typeof value !== 'boolean') fail(keywordPath, 'must be a boolean');
        } else if (keyword === '$schema' || keyword === '$id' || keyword === 'title' || keyword === 'description' || keyword === 'format') {
            if (typeof value !== 'string') fail(keywordPath, 'must be a string');
        } else if (keyword === 'examples' && !Array.isArray(value)) {
            fail(keywordPath, 'must be an array');
        }
    }
    const minimum = schema.minimum;
    const maximum = schema.maximum;
    if (typeof minimum === 'number' && typeof maximum === 'number' && minimum > maximum) {
        fail(path, 'minimum must not exceed maximum');
    }
    compareCardinality(schema, 'minProperties', 'maxProperties', path);
    compareCardinality(schema, 'minItems', 'maxItems', path);
    compareCardinality(schema, 'minLength', 'maxLength', path);
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/json-schema.ts
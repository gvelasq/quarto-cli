/*
* from-yaml.ts
*
* Functions to convert YAML to JSON Schema
*
* Copyright (C) 2021 by RStudio, PBC
*
*/

import { readAnnotatedYamlFromString } from "./annotated-yaml.ts";

import { globToRegExp } from "path/glob.ts";

import { error } from "log/mod.ts";
import { basename } from "path/mod.ts";
import { readYaml } from "../yaml.ts";

import { expandGlobSync } from "fs/expand_glob.ts";

import {
  getSchemaDefinition,
  hasSchemaDefinition,
  setSchemaDefinition,
} from "../lib/yaml-validation/schema.ts";

import { withValidator } from "../lib/yaml-validation/validator-queue.ts";

import {
  allOfSchema as allOfS,
  anyOfSchema as anyOfS,
  arraySchema as arrayOfS,
  booleanSchema as booleanS,
  completeSchema,
  completeSchemaOverwrite,
  documentSchema,
  enumSchema as enumS,
  idSchema as withId,
  nullSchema as nullS,
  numberSchema as numberS,
  objectSchema as objectS,
  refSchema as refS,
  regexSchema,
  stringSchema as stringS,
  tagSchema,
  valueSchema,
} from "./common.ts";

import { schemaPath } from "./utils.ts";
import { memoize } from "../memoize.ts";

import { ConcreteSchema } from "../lib/yaml-validation/types.ts";

function setBaseSchemaProperties(
  // deno-lint-ignore no-explicit-any
  yaml: any,
  schema: ConcreteSchema,
): ConcreteSchema {
  if (yaml.additionalCompletions) {
    schema = completeSchema(schema, ...yaml.additionalCompletions);
  }
  if (yaml.completions) {
    schema = completeSchemaOverwrite(schema, ...yaml.completions);
  }
  if (yaml.id) {
    schema = withId(schema, yaml.id);
  }
  if (yaml.hidden === true) {
    // don't complete anything through a `hidden` field
    schema = completeSchemaOverwrite(schema);
    schema = tagSchema(schema, {
      "hidden": true,
    });
  }
  if (yaml.tags) {
    schema = tagSchema(schema, yaml.tags);
  }

  // FIXME in YAML schema, we call it description
  // in the JSON objects, we call that "documentation"
  if (yaml.description) {
    schema = tagSchema(schema, { description: yaml.description });
    if (typeof yaml.description === "string") {
      schema = documentSchema(schema, yaml.description);
    } else if (typeof yaml.description === "object") {
      schema = documentSchema(schema, yaml.description.short);
    }
  }

  // make shallow copy so that downstream can assign to it
  const result = Object.assign({}, schema);

  if (yaml.errorDescription) {
    result.description = yaml.errorDescription;
  }

  if (yaml.errorMessage) {
    result.errorMessage = yaml.errorMessage;
  }

  return result;
}

// deno-lint-ignore no-explicit-any
function convertFromNull(yaml: any): ConcreteSchema {
  return setBaseSchemaProperties(yaml["null"], nullS);
}

// deno-lint-ignore no-explicit-any
function convertFromSchema(yaml: any): ConcreteSchema {
  const schema = convertFromYaml(yaml.schema);
  return setBaseSchemaProperties(yaml, schema);
}

// TODO we accept "string: pattern:" and "pattern: string:"
//      that seems yucky.
//
// deno-lint-ignore no-explicit-any
function convertFromString(yaml: any): ConcreteSchema {
  if (yaml["string"].pattern) {
    return setBaseSchemaProperties(
      yaml,
      setBaseSchemaProperties(
        yaml["string"],
        regexSchema(yaml["string"].pattern),
      ),
    );
  } else {
    return setBaseSchemaProperties(
      yaml,
      setBaseSchemaProperties(
        yaml["string"],
        stringS,
      ),
    );
  }
}

// deno-lint-ignore no-explicit-any
function convertFromPattern(yaml: any): ConcreteSchema {
  if (typeof yaml.pattern === "string") {
    return setBaseSchemaProperties(yaml, regexSchema(yaml.pattern));
  } else {
    return setBaseSchemaProperties(
      yaml,
      setBaseSchemaProperties(yaml.pattern, regexSchema(yaml.pattern.regex)),
    );
  }
}

// deno-lint-ignore no-explicit-any
function convertFromPath(yaml: any): ConcreteSchema {
  return setBaseSchemaProperties(yaml["path"], stringS);
}

// deno-lint-ignore no-explicit-any
function convertFromNumber(yaml: any): ConcreteSchema {
  return setBaseSchemaProperties(yaml["number"], numberS);
}

// deno-lint-ignore no-explicit-any
function convertFromBoolean(yaml: any): ConcreteSchema {
  return setBaseSchemaProperties(yaml["boolean"], booleanS);
}

// deno-lint-ignore no-explicit-any
function convertFromRef(yaml: any): ConcreteSchema {
  return setBaseSchemaProperties(yaml, refS(yaml.ref, `be ${yaml.ref}`));
}

// deno-lint-ignore no-explicit-any
function convertFromMaybeArrayOf(yaml: any): ConcreteSchema {
  const inner = convertFromYaml(yaml.maybeArrayOf);
  const schema = tagSchema(
    anyOfS(inner, arrayOfS(inner)),
    {
      "complete-from": ["anyOf", 0], // complete from `schema` completions, ignoring arrayOf
    },
  );

  return setBaseSchemaProperties(yaml, schema);
}

// deno-lint-ignore no-explicit-any
function convertFromArrayOf(yaml: any): ConcreteSchema {
  if (yaml.arrayOf.schema) {
    const result = arrayOfS(convertFromYaml(yaml.arrayOf.schema));
    return setBaseSchemaProperties(
      yaml,
      setBaseSchemaProperties(yaml.arrayOf, result),
    );
  } else {
    return setBaseSchemaProperties(
      yaml,
      arrayOfS(convertFromYaml(yaml.arrayOf)),
    );
  }
}

// deno-lint-ignore no-explicit-any
function convertFromAllOf(yaml: any): ConcreteSchema {
  if (yaml.allOf.schemas) {
    // deno-lint-ignore no-explicit-any
    const inner = yaml.allOf.schemas.map((x: any) => convertFromYaml(x));
    const schema = allOfS(...inner);
    return setBaseSchemaProperties(
      yaml,
      setBaseSchemaProperties(yaml.allOf, schema),
    );
  } else {
    // deno-lint-ignore no-explicit-any
    const inner = yaml.allOf.map((x: any) => convertFromYaml(x));
    const schema = allOfS(...inner);
    return setBaseSchemaProperties(yaml, schema);
  }
}

// deno-lint-ignore no-explicit-any
function convertFromAnyOf(yaml: any): ConcreteSchema {
  if (yaml.anyOf.schemas) {
    // deno-lint-ignore no-explicit-any
    const inner = yaml.anyOf.schemas.map((x: any) => convertFromYaml(x));
    const schema = anyOfS(...inner);
    return setBaseSchemaProperties(
      yaml,
      setBaseSchemaProperties(yaml.anyOf, schema),
    );
  } else {
    // deno-lint-ignore no-explicit-any
    const inner = yaml.anyOf.map((x: any) => convertFromYaml(x));
    const schema = anyOfS(...inner);
    return setBaseSchemaProperties(yaml, schema);
  }
}

// deno-lint-ignore no-explicit-any
function convertFromEnum(yaml: any): ConcreteSchema {
  const schema = yaml["enum"];
  // testing for the existence of "schema.values" doesn't work
  // because "values" is an array method.
  // deno-lint-ignore no-prototype-builtins
  if (schema.hasOwnProperty("values")) {
    return setBaseSchemaProperties(
      yaml,
      setBaseSchemaProperties(yaml["enum"], enumS(...schema.values)),
    );
  } else {
    return setBaseSchemaProperties(yaml, enumS(...schema));
  }
}

// deno-lint-ignore no-explicit-any
function convertFromRecord(yaml: any): ConcreteSchema {
  if (yaml.record.properties) {
    const schema = convertFromObject({
      "object": {
        "properties": yaml.record.properties,
        "closed": true,
        "required": "all",
      },
    });
    return setBaseSchemaProperties(
      yaml,
      setBaseSchemaProperties(yaml.record, schema),
    );
  } else {
    const schema = convertFromObject({
      "object": {
        "properties": yaml.record,
        "closed": true,
        "required": "all",
      },
    });
    return setBaseSchemaProperties(yaml, schema);
  }
}

// deno-lint-ignore no-explicit-any
function convertFromObject(yaml: any): ConcreteSchema {
  const schema = yaml["object"];
  // deno-lint-ignore no-explicit-any
  const params: Record<string, any> = {};
  if (schema.properties) {
    params.properties = Object.fromEntries(
      Object.entries(schema.properties)
        .map(([key, value]) => [key, convertFromYaml(value)]),
    );
  }
  if (schema.patternProperties) {
    params.patternProperties = Object.fromEntries(
      Object.entries(schema.properties)
        .map(([key, value]) => [key, convertFromYaml(value)]),
    );
  }
  if (schema.propertyNames !== undefined) {
    params.propertyNames = convertFromYaml(schema.propertyNames);
  } else if (schema.closed === true) {
    const objectKeys = Object.keys(params.properties || {});
    if (objectKeys.length === 0) {
      throw new Error("object schema `closed` requires field `properties`.");
    }
    params.propertyNames = enumS(...objectKeys);
  }
  if (schema.additionalProperties !== undefined) {
    // we special-case `false` here because as a schema, `false` means
    // "accept the value `false`" which is not what we want.
    if (schema.additionalProperties === false) {
      params.additionalProperties = false;
    } else {
      params.additionalProperties = convertFromYaml(
        schema.additionalProperties,
      );
    }
  }
  if (schema["super"]) {
    params.baseSchema = convertFromYaml(schema["super"]);
  }
  if (schema["required"] === "all") {
    params.required = Object.keys(schema.properties || {});
  } else if (schema["required"]) {
    params.required = schema["required"];
  }
  if (schema["completions"]) {
    params.completions = schema["completions"];
  }

  return setBaseSchemaProperties(
    yaml,
    setBaseSchemaProperties(schema, objectS(params)),
  );
}

// deno-lint-ignore no-explicit-any
function lookup(yaml: any): ConcreteSchema {
  if (!hasSchemaDefinition(yaml.resolveRef)) {
    throw new Error(`lookup of key ${yaml.resolveRef} in definitions failed`);
  }
  return getSchemaDefinition(yaml.resolveRef)!;
}

// deno-lint-ignore no-explicit-any
export function convertFromYaml(yaml: any): ConcreteSchema {
  // literals
  const literalValues = [
    { val: "object", schema: objectS() },
    { val: "path", schema: stringS }, // FIXME we should treat this one differently to record the autocompletion difference
    { val: "string", schema: stringS },
    { val: "number", schema: numberS },
    { val: "boolean", schema: booleanS },
    { val: null, schema: nullS },
  ];
  for (const { val, schema } of literalValues) {
    if (yaml === val) {
      return schema;
    }
  }

  // if the yaml file isn't an object, treat it as a "single-valued enum"
  //
  // NB this doesn't catch all strings. If you want the string "boolean", "path", etc,
  // then you still need to use enum explicitly. This is more useful for singleton
  // numbers and booleans, and only a convenience for (some) strings.
  if (typeof yaml !== "object") {
    return valueSchema(yaml);
  }

  // object key checks:
  interface KV {
    key: string;
    // deno-lint-ignore no-explicit-any
    value: (yaml: any) => ConcreteSchema;
  }
  const schemaObjectKeyFunctions: KV[] = [
    { key: "anyOf", value: convertFromAnyOf },
    { key: "allOf", value: convertFromAllOf },
    { key: "boolean", value: convertFromBoolean },
    { key: "arrayOf", value: convertFromArrayOf },
    { key: "enum", value: convertFromEnum },
    { key: "maybeArrayOf", value: convertFromMaybeArrayOf },
    { key: "null", value: convertFromNull },
    { key: "number", value: convertFromNumber },
    { key: "object", value: convertFromObject },
    { key: "path", value: convertFromPath },
    { key: "record", value: convertFromRecord },
    { key: "ref", value: convertFromRef },
    { key: "resolveRef", value: lookup },
    { key: "string", value: convertFromString },
    { key: "pattern", value: convertFromPattern },
    { key: "schema", value: convertFromSchema },
  ];
  for (const { key: objectKey, value: fun } of schemaObjectKeyFunctions) {
    try {
      if (yaml[objectKey as string] !== undefined) {
        return fun(yaml);
      }
    } catch (e) {
      error({ yaml });
      throw e;
    }
  }

  error(JSON.stringify(yaml, null, 2));
  throw new Error(
    "Internal Error: Cannot convert object; this should have failed validation.",
  );
}

export function convertFromYAMLString(src: string) {
  const yaml = readAnnotatedYamlFromString(src);

  return convertFromYaml(yaml.result);
}

export function objectSchemaFromFieldsFile(
  file: string,
  exclude?: (key: string) => boolean,
): ConcreteSchema {
  exclude = exclude ?? ((_key: string) => false);
  const properties: Record<string, ConcreteSchema> = {};
  // deno-lint-ignore no-explicit-any
  const global = readYaml(file) as any[];

  convertFromFieldsObject(global, properties);
  for (const key of Object.keys(properties)) {
    if (exclude(key)) {
      delete properties[key];
    }
  }

  return objectS({ properties });
}

export interface SchemaField {
  name: string;
  schema: ConcreteSchema;
  hidden?: boolean;
  // deno-lint-ignore no-explicit-any
  "default"?: any;
  alias?: string;
  disabled?: string[];
  enabled?: string[];
  description: string | {
    short: string;
    long: string;
  };
  // deno-lint-ignore no-explicit-any
  tags?: Record<string, any>;
}

export function objectSchemaFromGlob(
  glob: string,
  exclude?: (key: string) => boolean,
): ConcreteSchema {
  exclude = exclude ?? ((_key: string) => false);
  const properties: Record<string, ConcreteSchema> = {};
  for (const { path } of expandGlobSync(glob)) {
    convertFromFieldsObject(readYaml(path) as SchemaField[], properties);
  }
  for (const key of Object.keys(properties)) {
    if (exclude(key)) {
      delete properties[key];
    }
  }
  return objectS({ properties });
}

function annotateSchemaFromField(
  field: SchemaField,
  schema: ConcreteSchema,
): ConcreteSchema {
  if (field.enabled !== undefined) {
    schema = tagSchema(schema, {
      formats: field.enabled,
    });
  }
  if (field.disabled !== undefined) {
    schema = tagSchema(schema, {
      formats: (field.disabled as string[]).map((x) => `!${x}`),
    });
  }
  if (field.tags) {
    schema = tagSchema(schema, field.tags);
  }
  if (field.description) {
    if (typeof field.description === "string") {
      schema = documentSchema(schema, field.description);
    } else if (typeof field.description === "object") {
      schema = documentSchema(schema, field.description.short);
    }
    schema = tagSchema(schema, {
      description: field.description,
    });
  }
  if (field.hidden) {
    schema = tagSchema(schema, {
      "hidden": true,
    });
  }
  return schema;
}

export function schemaFromField(entry: SchemaField): ConcreteSchema {
  const schema = convertFromYaml(entry.schema);
  return annotateSchemaFromField(entry, schema);
}

export function convertFromFieldsObject(
  yaml: SchemaField[],
  obj?: Record<string, ConcreteSchema>,
): Record<string, ConcreteSchema> {
  const result = obj ?? {};

  for (const field of yaml) {
    let schema = convertFromYaml(field.schema);
    schema = annotateSchemaFromField(field, schema);
    result[field.name] = schema;
    if (field.alias) {
      result[field.alias] = schema;
    }
  }

  return result;
}

interface SchemaFieldIdDescriptor {
  schemaId: string;
  field: SchemaField;
}

export function schemaFieldsFromGlob(
  globPath: string,
  testFun?: (entry: SchemaField, path: string) => boolean,
): SchemaFieldIdDescriptor[] {
  const result = [];
  testFun = testFun ?? ((_e, _p) => true);
  for (const file of expandGlobSync(globPath)) {
    for (const field of readYaml(file.path) as SchemaField[]) {
      const fieldName = field.name;
      const schemaId = `quarto-resource-${file.name.slice(0, -4)}-${fieldName}`;
      if (testFun(field, file.path)) {
        result.push({
          schemaId,
          field,
        });
      }
    }
  }
  return result;
}

export const schemaRefContexts = memoize(() => {
  const groups = readYaml(schemaPath("groups.yml")) as Record<
    string,
    Record<string, Record<string, string>>
  >;
  const result = [];

  for (const [topLevel, sub] of Object.entries(groups)) {
    for (const key of Object.keys(sub)) {
      result.push(`${topLevel}-${key}`);
    }
  }
  return result;
}, () => "const") as (() => ConcreteSchema);

export function objectRefSchemaFromContextGlob(
  contextGlob: string,
  testFun?: (field: SchemaField, path: string) => boolean,
): ConcreteSchema {
  const regexp = globToRegExp(contextGlob);

  // Why is typescript thinking that testFun can be undefined
  // after the expression below?
  //
  // testFun = testFun ?? ((_field, _path) => true);
  return objectRefSchemaFromGlob(
    schemaPath("{document,cell}-*.yml"),
    (field: SchemaField, path: string) => {
      if (testFun !== undefined && !testFun(field, path)) {
        return false;
      }

      const pathContext = basename(path, ".yml");
      const schemaContexts = ((field?.tags?.contexts || []) as string[]);

      if (pathContext.match(regexp)) {
        return true;
      }
      return schemaContexts.some((c) => c.match(regexp));
    },
  );
}

export function objectRefSchemaFromGlob(
  glob: string,
  testFun?: (field: SchemaField, path: string) => boolean,
): ConcreteSchema {
  const properties: Record<string, ConcreteSchema> = {};

  for (const { schemaId, field } of schemaFieldsFromGlob(glob, testFun)) {
    const schema = refS(schemaId, schemaId); // FIXME this is a bad description
    properties[field.name] = schema;
    if (field.alias) {
      properties[field.alias] = schema;
    }
  }
  return objectS({ properties });
}

export async function buildSchemaResources() {
  const path = schemaPath("{cell-*,document-*,project}.yml");
  // precompile all of the field schemas
  for (const file of expandGlobSync(path)) {
    const yaml = readYaml(file.path) as SchemaField[];
    const entries = Object.entries(convertFromFieldsObject(yaml));
    for (const [fieldName, fieldSchema] of entries) {
      // TODO this id has to be defined consistently with schemaFieldsFromGlob.
      // It's a footgun.
      const schemaId = `quarto-resource-${file.name.slice(0, -4)}-${fieldName}`;
      const schema = withId(fieldSchema, schemaId);
      setSchemaDefinition(schema);
      await withValidator(schema, async (_validator) => {
      });
    }
  }
}

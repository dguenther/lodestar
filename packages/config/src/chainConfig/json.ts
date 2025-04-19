import {fromHex, toHex} from "@lodestar/utils";
import {ChainConfig, SpecValue, SpecValueTypeName, chainConfigTypes} from "./types.js";

const MAX_UINT64_JSON = "18446744073709551615";

export function chainConfigToJson(config: ChainConfig): Record<string, string> {
  const json: Record<string, string> = {};

  for (const key of Object.keys(chainConfigTypes) as (keyof ChainConfig)[]) {
    const value = config[key];
    if (value !== undefined) {
      json[key] = serializeSpecValue(value, chainConfigTypes[key]);
    }
  }

  return json;
}

export function chainConfigFromJson(json: Record<string, unknown>): ChainConfig {
  const config = {} as ChainConfig;

  for (const key of Object.keys(chainConfigTypes) as (keyof ChainConfig)[]) {
    const value = json[key];
    if (value !== undefined) {
      config[key] = deserializeSpecValue(json[key], chainConfigTypes[key], key) as never;
    }
  }

  return config;
}

export function specValuesToJson(spec: Record<string, SpecValue>): Record<string, string> {
  const json: Record<string, string> = {};

  for (const key of Object.keys(spec)) {
    json[key] = serializeSpecValue(spec[key], toSpecValueTypeName(spec[key]));
  }

  return json;
}

/** Automatic inference of typeName. For critical variables define type names, else infer */
export function toSpecValueTypeName(value: SpecValue): SpecValueTypeName {
  if (value instanceof Uint8Array) return "bytes";
  if (typeof value === "number") return "number";
  if (typeof value === "bigint") return "bigint";
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return "blobschedule";
  throw Error(`Unknown value type ${value}`);
}

export function serializeSpecValue(value: SpecValue, typeName: SpecValueTypeName): string {
  switch (typeName) {
    case "number":
      if (typeof value !== "number") {
        throw Error(`Invalid value ${value.toString()} expected number`);
      }
      if (value === Infinity) {
        return MAX_UINT64_JSON;
      }
      return value.toString(10);

    case "bigint":
      if (typeof value !== "bigint") {
        throw Error(`Invalid value ${value.toString()} expected bigint`);
      }
      return value.toString(10);

    case "bytes":
      if (!(value instanceof Uint8Array)) {
        throw Error(`Invalid value ${value.toString()} expected Uint8Array`);
      }
      return toHex(value);

    case "string":
      if (typeof value !== "string") {
        throw Error(`Invalid value ${value.toString()} expected string`);
      }
      return value;

    case "blobschedule":
      if (!Array.isArray(value)) {
        throw Error(`Invalid value ${value.toString()} expected Array`);
      }
      return JSON.stringify(
        value.map((obj) => {
          const result: Record<string, string> = {};
          for (const [key, val] of Object.entries(obj)) {
            result[key] = serializeSpecValue(val, toSpecValueTypeName(val));
          }
          return result;
        })
      );
  }
}

export function deserializeSpecValue(valueStr: unknown, typeName: SpecValueTypeName, keyName: string): SpecValue {
  if (typeof valueStr !== "string") {
    throw Error(`Invalid ${keyName} value ${valueStr as string} expected string`);
  }

  switch (typeName) {
    case "number":
      if (valueStr === MAX_UINT64_JSON) {
        return Infinity;
      }
      return parseInt(valueStr, 10);

    case "bigint":
      return BigInt(valueStr);

    case "bytes":
      return fromHex(valueStr);

    case "string":
      return valueStr;

    case "blobschedule": {
      try {
        const parsedJson = JSON.parse(valueStr);
        if (!Array.isArray(parsedJson)) {
          throw Error(`Invalid ${keyName} value, expected array but got ${typeof parsedJson}`);
        }
        return parsedJson.map((item) => {
          const result: Record<string, SpecValue> = {};
          for (const [key, val] of Object.entries(item)) {
            if (typeof val !== "string") {
              throw Error(`Invalid ${keyName}.${key} value ${val as string}, expected string`);
            }

            if (key === "EPOCH") {
              result[key] = parseInt(val, 10);
            } else if (key === "MAX_BLOBS_PER_BLOCK") {
              result[key] = parseInt(val, 10);
            } else {
              throw new Error("Unexpected key in blob schedule");
            }
          }
          return result;
        });
      } catch (e) {
        throw Error(`Invalid ${keyName} value '${valueStr}', failed to parse as JSON: ${(e as Error).message}`);
      }
    }
  }
}

import { ValidationError } from "./ValidationError";

export class RequestValidator {
  static requireString(value: unknown, fieldName: string): string {
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }

    throw new ValidationError(`${fieldName} is required`);
  }

  static requireNumericId(
    value: string | number | undefined,
    fieldName: string,
  ): number {
    if (typeof value === "number" && Number.isInteger(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    throw new ValidationError(`Invalid ${fieldName}`);
  }

  static requireMultipleNumericIds(
    values: Record<string, string | number | undefined>,
  ): Record<string, number> {
    const result: Record<string, number> = {};

    for (const [fieldName, value] of Object.entries(values)) {
      result[fieldName] = this.requireNumericId(value, fieldName);
    }

    return result;
  }

  static requireDefinedFields(
    source: Record<string, unknown>,
    fieldNames: string[],
    customMessage?: string,
  ): void {
    const missing = fieldNames.filter((field) => {
      const value = source[field];
      return value === undefined || value === null || value === "";
    });

    if (missing.length > 0) {
      if (customMessage) {
        throw new ValidationError(customMessage);
      }
      throw new ValidationError(
        `Missing required fields: ${missing.join(", ")}`,
      );
    }
  }

  static requireCommaSeparatedIntegers(
    value: string | string[] | undefined,
    fieldName: string,
    emptyMessage?: string,
  ): number[] {
    if (Array.isArray(value)) {
      const result = value
        .map((entry) => this.requireNumericId(entry, fieldName))
        .filter((entry, index, arr) => arr.indexOf(entry) === index);
      if (result.length === 0) {
        throw new ValidationError(
          emptyMessage || `No valid ${fieldName} provided`,
        );
      }
      return result;
    }

    if (typeof value === "string") {
      const parts = value
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0);

      const ids = parts.map((part) => this.requireNumericId(part, fieldName));

      if (ids.length === 0) {
        throw new ValidationError(
          emptyMessage || `No valid ${fieldName} provided`,
        );
      }

      return ids;
    }

    throw new ValidationError(emptyMessage || `No valid ${fieldName} provided`);
  }

  static requireArrayOfIntegers(
    value: unknown,
    fieldName: string,
    options: {
      emptyMessage?: string;
      arrayMessage?: string;
      invalidMessage?: string;
    } = {},
  ): number[] {
    const { emptyMessage, arrayMessage, invalidMessage } = options;

    if (!Array.isArray(value)) {
      throw new ValidationError(
        arrayMessage || `${fieldName} must be an array`,
      );
    }

    const integers = value
      .filter((item) => {
        if (typeof item === "number" && Number.isInteger(item)) {
          return true;
        }
        if (typeof item === "string" && item.trim() !== "") {
          const parsed = Number.parseInt(item, 10);
          return !Number.isNaN(parsed);
        }
        return false;
      })
      .map((item) => this.requireNumericId(item as any, fieldName));

    if (integers.length !== value.length) {
      throw new ValidationError(
        invalidMessage || `${fieldName} must contain only integers`,
      );
    }

    if (integers.length === 0 && emptyMessage) {
      throw new ValidationError(emptyMessage);
    }

    return integers;
  }
}

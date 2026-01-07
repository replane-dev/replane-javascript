import type { Condition, Override } from "./types";
import type { ReplaneContext, ReplaneLogger } from "./client-types";
import { fnv1a32ToUnit } from "./hash";

/**
 * Result of evaluating a condition
 */
export type EvaluationResult = "matched" | "not_matched" | "unknown";

/**
 * Evaluate config overrides based on context.
 * Returns the first matching override's value, or the base value if no override matches.
 *
 * @param baseValue - The default value to return if no override matches
 * @param overrides - Array of overrides to evaluate
 * @param context - The context to evaluate conditions against
 * @param logger - Logger for warnings
 * @returns The evaluated value
 */
export function evaluateOverrides<T>(
  baseValue: T,
  overrides: Override[],
  context: ReplaneContext,
  logger: ReplaneLogger
): T {
  // Find first matching override
  for (const override of overrides) {
    // All conditions must match (implicit AND)
    let overrideResult: EvaluationResult = "matched";
    const results = override.conditions.map((c) => evaluateCondition(c, context, logger));
    // AND: false > unknown > true
    if (results.some((r) => r === "not_matched")) {
      overrideResult = "not_matched";
    } else if (results.some((r) => r === "unknown")) {
      overrideResult = "unknown";
    }

    // Only use override if all conditions matched (not unknown)
    if (overrideResult === "matched") {
      return override.value as T;
    }
  }

  return baseValue;
}

/**
 * Evaluate a single condition against a context.
 *
 * @param condition - The condition to evaluate
 * @param context - The context to evaluate against
 * @param logger - Logger for warnings
 * @returns The evaluation result
 */
export function evaluateCondition(
  condition: Condition,
  context: ReplaneContext,
  logger: ReplaneLogger
): EvaluationResult {
  const operator = condition.operator;

  // Composite conditions
  if (operator === "and") {
    const results = condition.conditions.map((c) => evaluateCondition(c, context, logger));
    // AND: false > unknown > true
    if (results.some((r) => r === "not_matched")) return "not_matched";
    if (results.some((r) => r === "unknown")) return "unknown";
    return "matched";
  }

  if (operator === "or") {
    const results = condition.conditions.map((c) => evaluateCondition(c, context, logger));
    // OR: true > unknown > false
    if (results.some((r) => r === "matched")) return "matched";
    if (results.some((r) => r === "unknown")) return "unknown";
    return "not_matched";
  }

  if (operator === "not") {
    const result = evaluateCondition(condition.condition, context, logger);
    if (result === "matched") return "not_matched";
    if (result === "not_matched") return "matched";
    return "unknown"; // NOT unknown = unknown
  }

  // Segmentation
  if (operator === "segmentation") {
    const contextValue = context[condition.property];
    if (contextValue === undefined || contextValue === null) {
      return "unknown";
    }

    // FNV-1a hash to bucket [0, 100)
    const hashInput = String(contextValue) + condition.seed;
    const unitValue = fnv1a32ToUnit(hashInput);
    return unitValue >= condition.fromPercentage / 100 && unitValue < condition.toPercentage / 100
      ? "matched"
      : "not_matched";
  }

  // Property-based conditions
  const property = condition.property;
  const contextValue = context[property];
  const expectedValue = condition.value;

  if (contextValue === undefined) {
    return "unknown";
  }

  // Type casting
  const castedValue = castToContextType(expectedValue, contextValue);

  switch (operator) {
    case "equals":
      return contextValue === castedValue ? "matched" : "not_matched";

    case "in":
      if (!Array.isArray(castedValue)) return "unknown";
      return castedValue.includes(contextValue) ? "matched" : "not_matched";

    case "not_in":
      if (!Array.isArray(castedValue)) return "unknown";
      return !castedValue.includes(contextValue) ? "matched" : "not_matched";

    case "less_than":
      if (typeof contextValue === "number" && typeof castedValue === "number") {
        return contextValue < castedValue ? "matched" : "not_matched";
      }
      if (typeof contextValue === "string" && typeof castedValue === "string") {
        return contextValue < castedValue ? "matched" : "not_matched";
      }
      return "not_matched";

    case "less_than_or_equal":
      if (typeof contextValue === "number" && typeof castedValue === "number") {
        return contextValue <= castedValue ? "matched" : "not_matched";
      }
      if (typeof contextValue === "string" && typeof castedValue === "string") {
        return contextValue <= castedValue ? "matched" : "not_matched";
      }
      return "not_matched";

    case "greater_than":
      if (typeof contextValue === "number" && typeof castedValue === "number") {
        return contextValue > castedValue ? "matched" : "not_matched";
      }
      if (typeof contextValue === "string" && typeof castedValue === "string") {
        return contextValue > castedValue ? "matched" : "not_matched";
      }
      return "not_matched";

    case "greater_than_or_equal":
      if (typeof contextValue === "number" && typeof castedValue === "number") {
        return contextValue >= castedValue ? "matched" : "not_matched";
      }
      if (typeof contextValue === "string" && typeof castedValue === "string") {
        return contextValue >= castedValue ? "matched" : "not_matched";
      }
      return "not_matched";

    default:
      warnNever(operator, logger, `Unexpected operator: ${operator}`);
      return "unknown";
  }
}

/**
 * Helper to warn about exhaustive check failures
 */
function warnNever(value: never, logger: ReplaneLogger, message: string): void {
  logger.warn(message, { value });
}

/**
 * Cast expected value to match context value type.
 * This enables loose matching between different types (e.g., "25" matches 25).
 *
 * @param expectedValue - The value from the condition
 * @param contextValue - The value from the context
 * @returns The expected value cast to match the context value's type
 */
export function castToContextType(expectedValue: unknown, contextValue: unknown): unknown {
  if (typeof contextValue === "number") {
    if (typeof expectedValue === "string") {
      const num = Number(expectedValue);
      return isNaN(num) ? expectedValue : num;
    }
    return expectedValue;
  }

  if (typeof contextValue === "boolean") {
    if (typeof expectedValue === "string") {
      if (expectedValue === "true") return true;
      if (expectedValue === "false") return false;
    }
    if (typeof expectedValue === "number") {
      return expectedValue !== 0;
    }
    return expectedValue;
  }

  if (typeof contextValue === "string") {
    if (typeof expectedValue === "number" || typeof expectedValue === "boolean") {
      return String(expectedValue);
    }
    return expectedValue;
  }

  return expectedValue;
}

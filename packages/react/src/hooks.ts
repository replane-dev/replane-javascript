import { useContext, useEffect, useRef, useSyncExternalStore } from "react";
import { ReplaneContext } from "./context";
import type { UntypedReplaneConfig } from "./types";
import type { ReplaneClient, GetConfigOptions } from "@replanejs/sdk";

export function useReplane<T extends object = UntypedReplaneConfig>(): ReplaneClient<T> {
  const context = useContext(ReplaneContext);
  if (!context) {
    throw new Error("useReplane must be used within a ReplaneProvider");
  }
  return context.client as ReplaneClient<T>;
}

export function useConfig<T>(name: string, options?: GetConfigOptions): T {
  const client = useReplane();

  const value = useSyncExternalStore(
    (onStoreChange) => {
      return client.subscribe(name, onStoreChange);
    },
    () => client.get(name, options) as T,
    () => client.get(name, options) as T
  );

  return value;
}

/**
 * Creates a typed version of useReplane hook.
 *
 * @example
 * ```tsx
 * interface AppConfigs {
 *   theme: { darkMode: boolean };
 *   features: { beta: boolean };
 * }
 *
 * const useAppReplane = createReplaneHook<AppConfigs>();
 *
 * function MyComponent() {
 *   const replane = useAppReplane();
 *   // replane.get("theme") returns { darkMode: boolean }
 * }
 * ```
 */
export function createReplaneHook<TConfigs extends object>() {
  return function useTypedReplane(): ReplaneClient<TConfigs> {
    return useReplane<TConfigs>();
  };
}

/**
 * Creates a typed version of useConfig hook.
 *
 * @example
 * ```tsx
 * interface AppConfigs {
 *   theme: { darkMode: boolean };
 *   features: { beta: boolean };
 * }
 *
 * const useAppConfig = createConfigHook<AppConfigs>();
 *
 * function MyComponent() {
 *   const theme = useAppConfig("theme");
 *   // theme is typed as { darkMode: boolean }
 * }
 * ```
 */
export function createConfigHook<TConfigs extends object>() {
  return function useTypedConfig<K extends keyof TConfigs>(
    name: K,
    options?: GetConfigOptions
  ): TConfigs[K] {
    return useConfig<TConfigs[K]>(String(name), options);
  };
}

/**
 * Hook for creating stateful resources with cleanup support.
 * Unlike useMemo, this guarantees cleanup when dependencies change or on unmount.
 *
 * @param factory - Function that creates the resource
 * @param cleanup - Function that cleans up the resource
 * @param deps - Dependencies array (resource is recreated when these change)
 */
export function useStateful<T>(factory: () => T, cleanup: (value: T) => void, deps: React.DependencyList): T {
  const valueRef = useRef<T | null>(null);
  const initializedRef = useRef(false);

  // Create initial value synchronously on first render
  if (!initializedRef.current) {
    valueRef.current = factory();
    initializedRef.current = true;
  }

  useEffect(() => {
    // On mount or deps change, we may need to recreate
    // If this is not the initial mount, recreate the value
    if (valueRef.current === null) {
      valueRef.current = factory();
    }

    return () => {
      if (valueRef.current !== null) {
        cleanup(valueRef.current);
        valueRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return valueRef.current as T;
}

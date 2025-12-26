"use client";

import { useCallback, useContext, useSyncExternalStore } from "react";
import { ReplaneContext } from "./context";
import type { UntypedReplaneConfig } from "./types";
import type { Replane, GetConfigOptions } from "@replanejs/sdk";

export function useReplane<T extends object = UntypedReplaneConfig>(): Replane<T> {
  const context = useContext(ReplaneContext);
  if (!context) {
    throw new Error("useReplane must be used within a ReplaneProvider");
  }
  return context.replane as Replane<T>;
}

export function useConfig<T>(name: string, options?: GetConfigOptions<T>): T {
  const client = useReplane();

  const subscribe = useCallback(
    (callback: () => void) => {
      return client.subscribe(name, callback);
    },
    [client, name]
  );

  const get = useCallback(() => {
    return client.get(name, options) as T;
  }, [client, name, options]);

  const value = useSyncExternalStore(subscribe, get, get);

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
  return function useTypedReplane(): Replane<TConfigs> {
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
    options?: GetConfigOptions<TConfigs[K]>
  ): TConfigs[K] {
    return useConfig<TConfigs[K]>(String(name), options);
  };
}

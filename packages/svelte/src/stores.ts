import { readable, type Readable } from "svelte/store";
import type { GetConfigOptions, Replane } from "@replanejs/sdk";
import { getReplaneContext } from "./context";

/**
 * Get the Replane client from context.
 *
 * Must be called during component initialization (in the script section, not in event handlers).
 *
 * @returns The Replane client
 * @throws Error if called outside a ReplaneProvider
 *
 * @example
 * ```svelte
 * <script>
 *   import { getReplane } from '@replanejs/svelte';
 *
 *   const replane = getReplane();
 *   // Access client directly: replane.get('configName')
 * </script>
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getReplane<T extends Record<string, unknown> = any>(): Replane<T> {
  return getReplaneContext<T>().client;
}

/**
 * Create a reactive store for a specific config value.
 *
 * Must be called during component initialization (in the script section, not in event handlers).
 * The returned store will automatically update when the config value changes on the server.
 *
 * @param name - The name of the config to subscribe to
 * @param options - Optional context for override evaluation
 * @returns A Svelte readable store containing the config value
 *
 * @example
 * ```svelte
 * <script>
 *   import { config } from '@replanejs/svelte';
 *
 *   const featureEnabled = config<boolean>('featureEnabled');
 *   const greeting = config<string>('greeting', {
 *     context: { userId: '123' }
 *   });
 * </script>
 *
 * {#if $featureEnabled}
 *   <p>{$greeting}</p>
 * {/if}
 * ```
 */
export function config<T>(name: string, options?: GetConfigOptions<T>): Readable<T> {
  const { client } = getReplaneContext();

  return readable<T>(client.get(name, options) as T, (set) => {
    // Subscribe to config changes
    const unsubscribe = client.subscribe(name, () => {
      set(client.get(name, options) as T);
    });

    // Return cleanup function
    return unsubscribe;
  });
}

/**
 * Create a reactive store for a config value using a pre-existing client.
 *
 * This is useful when you have direct access to a client and don't want to
 * use the context-based approach. Similar to readable() or derived().
 *
 * @param replane - The Replane client to use
 * @param name - The name of the config to subscribe to
 * @param options - Optional context for override evaluation
 * @returns A Svelte readable store containing the config value
 *
 * @example
 * ```svelte
 * <script>
 *   import { configFrom } from '@replanejs/svelte';
 *   import { replane } from './replane-client';
 *
 *   const featureEnabled = configFrom(replane, 'featureEnabled');
 * </script>
 *
 * {#if $featureEnabled}
 *   <p>Feature is enabled!</p>
 * {/if}
 * ```
 */
export function configFrom<TConfigs extends Record<string, unknown>, K extends keyof TConfigs>(
  replane: Replane<TConfigs>,
  name: K,
  options?: GetConfigOptions<TConfigs[K]>
): Readable<TConfigs[K]> {
  return readable<TConfigs[K]>(replane.get(name, options), (set) => {
    const unsubscribe = replane.subscribe(name, () => {
      set(replane.get(name, options));
    });
    return unsubscribe;
  });
}

/**
 * Creates a typed version of getReplane().
 *
 * By creating typed accessors once and importing them throughout your app,
 * you get full type safety and autocomplete for config names and values.
 *
 * @example
 * ```ts
 * // $lib/replane/index.ts
 * import { createTypedReplane } from '@replanejs/svelte';
 *
 * interface AppConfigs {
 *   theme: { darkMode: boolean };
 *   features: { beta: boolean };
 * }
 *
 * export const getAppReplane = createTypedReplane<AppConfigs>();
 * ```
 *
 * @example
 * ```svelte
 * <script>
 *   import { getAppReplane } from '$lib/replane';
 *
 *   const replane = getAppReplane();
 *   const theme = replane.get("theme"); // fully typed
 * </script>
 * ```
 */
export function createTypedReplane<TConfigs extends Record<string, unknown>>() {
  return function (): Replane<TConfigs> {
    return getReplane<TConfigs>();
  };
}

/**
 * Creates a typed version of config().
 *
 * By creating typed accessors once and importing them throughout your app,
 * you get full type safety and autocomplete for config names and values.
 *
 * @example
 * ```ts
 * // $lib/replane/index.ts
 * import { createTypedConfig } from '@replanejs/svelte';
 *
 * interface AppConfigs {
 *   theme: { darkMode: boolean; primaryColor: string };
 *   features: { beta: boolean; maxItems: number };
 * }
 *
 * export const appConfig = createTypedConfig<AppConfigs>();
 * ```
 *
 * @example
 * ```svelte
 * <script>
 *   import { appConfig } from '$lib/replane';
 *
 *   // Config names autocomplete, return values are fully typed
 *   const theme = appConfig("theme");
 *   // $theme is typed as { darkMode: boolean; primaryColor: string }
 * </script>
 *
 * <div style:color={$theme.primaryColor}>
 *   {$theme.darkMode ? "Dark" : "Light"}
 * </div>
 * ```
 */
export function createTypedConfig<TConfigs extends Record<string, unknown>>() {
  return function <K extends keyof TConfigs>(
    name: K,
    options?: GetConfigOptions<TConfigs[K]>
  ): Readable<TConfigs[K]> {
    return config<TConfigs[K]>(String(name), options);
  };
}

import { readable, type Readable } from "svelte/store";
import type { ReplaneClient } from "@replanejs/sdk";
import { getReplaneContext } from "./context";
import type { ReplaneContextValue, UseConfigOptions } from "./types";

/**
 * Get the Replane context containing the client.
 *
 * Must be called during component initialization (in the script section, not in event handlers).
 *
 * @returns The Replane context with the client
 * @throws Error if called outside a ReplaneProvider
 *
 * @example
 * ```svelte
 * <script>
 *   import { useReplane } from '@replanejs/svelte';
 *
 *   const { client } = useReplane();
 *   // Use client directly: client.get('configName')
 * </script>
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useReplane<T extends object = any>(): ReplaneContextValue<T> {
  return getReplaneContext<T>();
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
 *   import { useConfig } from '@replanejs/svelte';
 *
 *   const featureEnabled = useConfig<boolean>('featureEnabled');
 *   const greeting = useConfig<string>('greeting', {
 *     context: { userId: '123' }
 *   });
 * </script>
 *
 * {#if $featureEnabled}
 *   <p>{$greeting}</p>
 * {/if}
 * ```
 */
export function useConfig<T>(name: string, options?: UseConfigOptions): Readable<T> {
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
 * use the context-based approach.
 *
 * @param client - The Replane client to use
 * @param name - The name of the config to subscribe to
 * @param options - Optional context for override evaluation
 * @returns A Svelte readable store containing the config value
 *
 * @example
 * ```svelte
 * <script>
 *   import { createConfigStore } from '@replanejs/svelte';
 *   import { client } from './replane-client';
 *
 *   const featureEnabled = createConfigStore<boolean>(client, 'featureEnabled');
 * </script>
 *
 * {#if $featureEnabled}
 *   <p>Feature is enabled!</p>
 * {/if}
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createConfigStore<T, C extends object = any>(
  client: ReplaneClient<C>,
  name: string,
  options?: UseConfigOptions
): Readable<T> {
  return readable<T>(client.get(name as keyof C, options) as T, (set) => {
    const unsubscribe = client.subscribe(name as keyof C, () => {
      set(client.get(name as keyof C, options) as T);
    });
    return unsubscribe;
  });
}

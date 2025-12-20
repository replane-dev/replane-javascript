import { readable } from "svelte/store";
import { getReplaneContext } from "./context";
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
export function useReplane() {
    return getReplaneContext();
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
export function useConfig(name, options) {
    const { client } = getReplaneContext();
    return readable(client.get(name, options), (set) => {
        // Subscribe to config changes
        const unsubscribe = client.subscribe(name, () => {
            set(client.get(name, options));
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
export function createConfigStore(client, name, options) {
    return readable(client.get(name, options), (set) => {
        const unsubscribe = client.subscribe(name, () => {
            set(client.get(name, options));
        });
        return unsubscribe;
    });
}

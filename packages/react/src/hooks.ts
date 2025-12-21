import { useContext, useSyncExternalStore } from "react";
import { ReplaneContext } from "./context";
import type { ReplaneContextValue, UntypedReplaneConfig } from "./types";
import { GetConfigOptions } from "@replanejs/sdk";

export function useReplane<T extends object = UntypedReplaneConfig>(): ReplaneContextValue<T> {
  const context = useContext(ReplaneContext);
  if (!context) {
    throw new Error("useReplane must be used within a ReplaneProvider");
  }
  return context as ReplaneContextValue<T>;
}

export function useConfig<T>(name: string, options?: GetConfigOptions): T {
  const { client } = useReplane();

  const value = useSyncExternalStore(
    (onStoreChange) => {
      return client.subscribe(name, onStoreChange);
    },
    () => client.get(name, options) as T,
    () => client.get(name, options) as T
  );

  return value;
}

export function createConfigHook<TConfigs extends object>() {
  return function useTypedConfig<K extends keyof TConfigs>(
    name: K,
    options?: GetConfigOptions
  ): TConfigs[K] {
    return useConfig<TConfigs[K]>(String(name), options);
  };
}

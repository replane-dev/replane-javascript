import { useContext, useSyncExternalStore } from "react";
import { ReplaneContext } from "./context";
import type { ReplaneContextValue } from "./types";

export function useReplane<T extends object = Record<string, unknown>>(): ReplaneContextValue<T> {
  const context = useContext(ReplaneContext);
  if (!context) {
    throw new Error("useReplane must be used within a ReplaneProvider");
  }
  return context as ReplaneContextValue<T>;
}

export function useConfig <T>(
  name: string,
  options?: { context?: Record<string, string | number | boolean | null> }
): T {
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

import { createContext } from "react";
import type { ReplaneContextValue } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ReplaneContext = createContext<ReplaneContextValue<any> | null>(null);

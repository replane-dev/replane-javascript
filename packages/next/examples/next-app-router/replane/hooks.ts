/**
 * Typed Replane hooks for this application.
 *
 * By creating typed hooks once and importing them throughout your app,
 * you get full type safety and autocomplete for config names and values.
 */
import { createConfigHook, createReplaneHook } from "@replanejs/next";
import type { AppConfigs } from "./types";

export const useAppConfig = createConfigHook<AppConfigs>();

export const useAppReplane = createReplaneHook<AppConfigs>();

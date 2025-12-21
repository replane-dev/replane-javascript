// ============================================================================
// Type Definitions
// ============================================================================

// Define your configuration types
export interface ThemeConfig {
  primaryColor: string;
  darkMode: boolean;
}

export interface FeatureFlags {
  newHeader: boolean;
  showBanner: boolean;
  experimentalFeatures: boolean;
}

// Define all your configs in one interface for type-safe access
export interface AppConfigs {
  "theme-config": ThemeConfig;
  "feature-flags": FeatureFlags;
  "banner-message": string;
}

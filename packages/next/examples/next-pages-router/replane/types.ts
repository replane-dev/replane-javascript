/**
 * Define your Replane config types here.
 * These types provide full type safety when accessing configs.
 */
export interface AppConfigs {
  theme: {
    darkMode: boolean;
    primaryColor: string;
  };
  features: {
    betaEnabled: boolean;
    maxItems: number;
  };
}

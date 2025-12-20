"use client";

import { useConfig } from "@replanejs/next";

interface FeatureFlags {
  newNavigation: boolean;
  showFooter: boolean;
  experimentalFeatures: boolean;
}

export function Footer() {
  const features = useConfig<FeatureFlags>("feature-flags");

  if (!features.showFooter) {
    return null;
  }

  return (
    <footer className="footer">
      <p>Powered by Replane - Dynamic Configuration for Modern Apps</p>
    </footer>
  );
}

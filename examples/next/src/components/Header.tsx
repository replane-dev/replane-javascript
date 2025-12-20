"use client";

import { useConfig } from "@replanejs/next";

interface FeatureFlags {
  newNavigation: boolean;
  showFooter: boolean;
  experimentalFeatures: boolean;
}

export function Header() {
  const features = useConfig<FeatureFlags>("feature-flags");
  const siteTitle = useConfig<string>("site-title");

  if (features.newNavigation) {
    return (
      <header className="header new-nav">
        <h1>{siteTitle}</h1>
        <nav>
          <a href="#">Home</a>
          <a href="#">Features</a>
          <a href="#">Documentation</a>
          <a href="#">Pricing</a>
        </nav>
      </header>
    );
  }

  return (
    <header className="header">
      <h1>{siteTitle}</h1>
    </header>
  );
}

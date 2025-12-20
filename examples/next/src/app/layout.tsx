import type { Metadata } from "next";
import { getReplaneSnapshot } from "@replanejs/next/server";
import { ReplaneNextProvider } from "@replanejs/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Replane Next.js Example",
  description: "Example demonstrating @replanejs/next for SSR feature flags",
};

// Define config types
interface Configs {
  "theme-config": ThemeConfig;
  "feature-flags": FeatureFlags;
  "site-title": string;
}

interface ThemeConfig {
  primaryColor: string;
  darkMode: boolean;
}

interface FeatureFlags {
  newNavigation: boolean;
  showFooter: boolean;
  experimentalFeatures: boolean;
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch configs on the server during SSR
  // This eliminates any loading state on the client
  const snapshot = await getReplaneSnapshot<Configs>({
    baseUrl: process.env.REPLANE_BASE_URL || "https://replane.example.com",
    sdkKey: process.env.REPLANE_SDK_KEY || "demo-sdk-key",
    // Optional: use Next.js caching
    // fetchFn: (url, init) => fetch(url, { ...init, next: { revalidate: 60 } }),
    fallbacks: {
      "theme-config": { primaryColor: "#3b82f6", darkMode: false },
      "feature-flags": {
        newNavigation: true,
        showFooter: true,
        experimentalFeatures: false,
      },
      "site-title": "Replane Next.js Example",
    },
  });

  return (
    <html lang="en">
      <body>
        <ReplaneNextProvider
          snapshot={snapshot}
          // Optional: enable real-time updates on the client
          connection={{
            baseUrl:
              process.env.NEXT_PUBLIC_REPLANE_BASE_URL ||
              "https://replane.example.com",
            sdkKey: process.env.NEXT_PUBLIC_REPLANE_SDK_KEY || "demo-sdk-key",
          }}
        >
          {children}
        </ReplaneNextProvider>
      </body>
    </html>
  );
}

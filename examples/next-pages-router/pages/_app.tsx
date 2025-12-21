import type { AppProps } from "next/app";
import { ReplaneProvider, type ReplaneSnapshot } from "@replanejs/next";

// Define your config types for type safety
interface AppConfigs {
  theme: {
    darkMode: boolean;
    primaryColor: string;
  };
  features: {
    betaEnabled: boolean;
    maxItems: number;
  };
}

// Extend pageProps to include replaneSnapshot
interface PagePropsWithReplane {
  replaneSnapshot?: ReplaneSnapshot<AppConfigs>;
}

export default function App({
  Component,
  pageProps,
}: AppProps<PagePropsWithReplane>) {
  // Only render provider if snapshot is available (from SSR)
  // This allows pages without SSR to work without errors
  if (!pageProps.replaneSnapshot) {
    return <Component {...pageProps} />;
  }

  // ReplaneProvider with snapshot hydrates from server data
  // and establishes live connection for real-time updates
  return (
    <ReplaneProvider
      snapshot={pageProps.replaneSnapshot}
      options={{
        baseUrl: process.env.NEXT_PUBLIC_REPLANE_BASE_URL!,
        sdkKey: process.env.NEXT_PUBLIC_REPLANE_SDK_KEY!,
      }}
    >
      <Component {...pageProps} />
    </ReplaneProvider>
  );
}

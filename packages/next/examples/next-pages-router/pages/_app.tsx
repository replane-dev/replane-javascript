import type { AppContext, AppProps } from "next/app";
import App from "next/app";
import { ReplaneProvider, type ReplaneSnapshot } from "@replanejs/next";
import type { AppConfigs } from "@/replane/types";
import { fetchReplaneSnapshot } from "@/replane/server";

interface AppPropsWithReplane extends AppProps {
  replaneSnapshot: ReplaneSnapshot<AppConfigs>;
}

export default function MyApp({ Component, pageProps, replaneSnapshot }: AppPropsWithReplane) {
  return (
    <ReplaneProvider
      snapshot={replaneSnapshot}
      options={{
        baseUrl: process.env.NEXT_PUBLIC_REPLANE_BASE_URL!,
        sdkKey: process.env.NEXT_PUBLIC_REPLANE_SDK_KEY!,
      }}
    >
      <Component {...pageProps} />
    </ReplaneProvider>
  );
}

// Fetch Replane snapshot for all pages
MyApp.getInitialProps = async (appContext: AppContext) => {
  // Run page-level getInitialProps first
  const appProps = await App.getInitialProps(appContext);

  // Fetch Replane snapshot on the server
  const replaneSnapshot = await fetchReplaneSnapshot();

  return {
    ...appProps,
    replaneSnapshot,
  };
};

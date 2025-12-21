import type { GetStaticProps, InferGetStaticPropsType } from "next";
import { getReplaneProps, type ReplaneSnapshot } from "@replanejs/next";
import { ConfigDisplay } from "@/components/ConfigDisplay";

// Define your config types
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

interface PageProps {
  replaneSnapshot: ReplaneSnapshot<AppConfigs>;
}

export const getStaticProps: GetStaticProps<PageProps> = async () => {
  // Fetch configs at build time with ISR revalidation
  // Use NEXT_PUBLIC_ env vars so the same values work on both server and client
  const { snapshot, revalidate } = await getReplaneProps<AppConfigs>({
    baseUrl: process.env.NEXT_PUBLIC_REPLANE_BASE_URL!,
    sdkKey: process.env.NEXT_PUBLIC_REPLANE_SDK_KEY!,
    // Revalidate configs every 60 seconds (ISR)
    revalidate: 60,
  });

  return {
    props: {
      replaneSnapshot: snapshot,
    },
    revalidate,
  };
};

export default function StaticPage(
  _props: InferGetStaticPropsType<typeof getStaticProps>
) {
  return (
    <main style={{ padding: "2rem" }}>
      <h1>Static Generation (ISR) Example</h1>
      <p>
        This page uses <code>getStaticProps</code> with Incremental Static
        Regeneration.
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2>Current Configuration</h2>
        <ConfigDisplay />
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>How it works</h2>
        <ol>
          <li>
            <strong>Build time:</strong> Configs are fetched during{" "}
            <code>next build</code>
          </li>
          <li>
            <strong>ISR:</strong> Page revalidates every 60 seconds
          </li>
          <li>
            <strong>Live Updates:</strong> If <code>options</code> is provided
            to ReplaneProvider, client receives real-time updates via WebSocket.
            Without <code>options</code>, configs remain static.
          </li>
        </ol>
        <p>
          <a href="/">← Back to SSR example</a>
        </p>
      </section>
    </main>
  );
}

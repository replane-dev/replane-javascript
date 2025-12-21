import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { getReplaneSnapshot, type ReplaneSnapshot } from "@replanejs/next";
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

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  // Fetch configs on the server
  // Use NEXT_PUBLIC_ env vars so the same values work on both server and client
  const snapshot = await getReplaneSnapshot<AppConfigs>({
    baseUrl: process.env.NEXT_PUBLIC_REPLANE_BASE_URL!,
    sdkKey: process.env.NEXT_PUBLIC_REPLANE_SDK_KEY!,
  });

  return {
    props: {
      replaneSnapshot: snapshot,
    },
  };
};

export default function Home(
  _props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  return (
    <main style={{ padding: "2rem" }}>
      <h1>Next.js Pages Router + Replane Example</h1>
      <p>
        This example demonstrates getServerSideProps with client hydration.
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2>Current Configuration</h2>
        <ConfigDisplay />
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>How it works</h2>
        <ol>
          <li>
            <strong>getServerSideProps:</strong> Configs are fetched using{" "}
            <code>getReplaneSnapshot()</code>
          </li>
          <li>
            <strong>_app.tsx:</strong> Wraps the app with{" "}
            <code>ReplaneProvider</code>
          </li>
          <li>
            <strong>Hydration:</strong> Client hydrates with server data - no
            flash!
          </li>
          <li>
            <strong>Live Updates:</strong> With <code>options</code>,
            configs update in real-time
          </li>
        </ol>
      </section>
    </main>
  );
}

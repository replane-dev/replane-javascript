import { ConfigDisplay } from "@/components/ConfigDisplay";

// No getServerSideProps needed - Replane snapshot is fetched in _app.tsx
export default function Home() {
  return (
    <main style={{ padding: "2rem" }}>
      <h1>Next.js Pages Router + Replane Example</h1>
      <p>This example demonstrates SSR with client hydration using App.getInitialProps.</p>

      <section style={{ marginTop: "2rem" }}>
        <h2>Current Configuration</h2>
        <ConfigDisplay />
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>How it works</h2>
        <ol>
          <li>
            <strong>_app.tsx:</strong> Fetches configs using <code>getInitialProps</code> for all
            pages
          </li>
          <li>
            <strong>ReplaneProvider:</strong> Wraps the app with the fetched snapshot
          </li>
          <li>
            <strong>Hydration:</strong> Client hydrates with server data - no flash!
          </li>
          <li>
            <strong>Live Updates:</strong> With <code>liveUpdates</code>, configs update in
            real-time
          </li>
        </ol>
      </section>
    </main>
  );
}

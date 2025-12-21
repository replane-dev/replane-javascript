import { ConfigDisplay } from "@/components/ConfigDisplay";

// No getStaticProps needed - Replane snapshot is fetched in _app.tsx
export default function AnotherPage() {
  return (
    <main style={{ padding: "2rem" }}>
      <h1>Another Page Example</h1>
      <p>This page demonstrates that Replane works on all pages without extra setup.</p>

      <section style={{ marginTop: "2rem" }}>
        <h2>Current Configuration</h2>
        <ConfigDisplay />
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>How it works</h2>
        <ol>
          <li>
            <strong>No data fetching needed:</strong> Replane is fetched once in{" "}
            <code>_app.tsx</code>
          </li>
          <li>
            <strong>Automatic SSR:</strong> All pages get the snapshot from the app level
          </li>
          <li>
            <strong>Live Updates:</strong> Client receives real-time updates via SSE
          </li>
        </ol>
        <p>
          <a href="/">← Back to home</a>
        </p>
      </section>
    </main>
  );
}

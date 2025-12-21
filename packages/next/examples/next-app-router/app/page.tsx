import { ConfigDisplay } from "@/components/ConfigDisplay";

export default function Home() {
  return (
    <main style={{ padding: "2rem" }}>
      <h1>Next.js App Router + Replane Example</h1>
      <p>
        This example demonstrates server-side rendering with client hydration.
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2>Current Configuration</h2>
        {/* ConfigDisplay is a client component that uses the useConfig hook */}
        <ConfigDisplay />
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>How it works</h2>
        <ol>
          <li>
            <strong>Server:</strong> Configs are fetched in{" "}
            <code>layout.tsx</code> using <code>getReplaneSnapshot()</code>
          </li>
          <li>
            <strong>SSR:</strong> The snapshot is passed to{" "}
            <code>ReplaneProvider</code> for server rendering
          </li>
          <li>
            <strong>Hydration:</strong> Client hydrates with the same data - no
            flash!
          </li>
          <li>
            <strong>Live Updates:</strong> With <code>liveUpdates</code>{" "}
            enabled, configs update in real-time
          </li>
        </ol>
      </section>
    </main>
  );
}

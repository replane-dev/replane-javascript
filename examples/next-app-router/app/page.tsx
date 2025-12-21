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
        <ConfigDisplay />
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>How it works</h2>
        <ol>
          <li>
            <strong>Server:</strong> <code>ReplaneRoot</code> in{" "}
            <code>layout.tsx</code> fetches configs on the server
          </li>
          <li>
            <strong>SSR:</strong> Children are rendered with config data
            available
          </li>
          <li>
            <strong>Hydration:</strong> Client hydrates with the same data - no
            flash!
          </li>
          <li>
            <strong>Live Updates:</strong> Configs update in real-time (disable
            with <code>static</code> prop)
          </li>
        </ol>
      </section>
    </main>
  );
}

import { Header } from "@/components/Header";
import { FeatureShowcase } from "@/components/FeatureShowcase";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main>
      <Header />
      <div className="container">
        <h1>Replane Next.js Example</h1>
        <p>
          This example demonstrates how to use <code>@replanejs/next</code> for
          server-side rendered feature flags with real-time updates.
        </p>

        <section className="intro">
          <h2>How it works</h2>
          <ol>
            <li>
              <strong>Server-side fetch:</strong> Configs are fetched during SSR
              using <code>getReplaneSnapshot()</code>
            </li>
            <li>
              <strong>Instant hydration:</strong> The client hydrates with
              server-fetched data (no loading state)
            </li>
            <li>
              <strong>Real-time updates:</strong> After hydration, the client
              connects to Replane for live updates via SSE
            </li>
          </ol>
        </section>

        <FeatureShowcase />
      </div>
      <Footer />
    </main>
  );
}

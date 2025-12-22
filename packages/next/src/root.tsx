/**
 * Server-side utilities for Next.js
 * Use this module in Server Components, getServerSideProps, or getStaticProps
 */

import type { ReactNode } from "react";
import { getReplaneSnapshot, type ReplaneClientOptions } from "@replanejs/sdk";
import { ReplaneProvider } from "@replanejs/react";
import { DEFAULT_AGENT } from "./version";

/**
 * Props for ReplaneRoot server component
 */
export interface ReplaneRootProps<T extends object> {
  /**
   * Options for Replane client.
   * Used for both server-side fetching and client-side live updates.
   */
  options: ReplaneClientOptions<T>;
  /**
   * React children to render inside the provider
   */
  children: ReactNode;
}

/**
 * Server component that fetches Replane configs and provides them to the app.
 * This is the simplest way to set up Replane in Next.js App Router.
 *
 * @example Basic usage in layout.tsx
 * ```tsx
 * // app/layout.tsx
 * import { ReplaneRoot } from "@replanejs/next";
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <ReplaneRoot
 *           options={{
 *             baseUrl: process.env.NEXT_PUBLIC_REPLANE_BASE_URL!,
 *             sdkKey: process.env.NEXT_PUBLIC_REPLANE_SDK_KEY!,
 *           }}
 *         >
 *           {children}
 *         </ReplaneRoot>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export async function ReplaneRoot<T extends object>({ options, children }: ReplaneRootProps<T>) {
  const optionsWithAgent = {
    ...options,
    agent: options.agent ?? DEFAULT_AGENT,
  };
  const snapshot = await getReplaneSnapshot(optionsWithAgent);

  return (
    <ReplaneProvider options={optionsWithAgent} snapshot={snapshot}>
      {children}
    </ReplaneProvider>
  );
}

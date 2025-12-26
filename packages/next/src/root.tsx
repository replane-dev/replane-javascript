/**
 * Server-side utilities for Next.js
 * Use this module in Server Components, getServerSideProps, or getStaticProps
 */

import type { ReactNode } from "react";
import { getReplaneSnapshot, type GetReplaneSnapshotOptions } from "@replanejs/sdk";
import { ReplaneProvider } from "@replanejs/react";
import { DEFAULT_AGENT } from "./version";

/**
 * Props for ReplaneRoot server component
 */
export interface ReplaneRootProps<T extends object> extends GetReplaneSnapshotOptions<T> {
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
 *           connection={{
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
export async function ReplaneRoot<T extends object>({ children, ...options }: ReplaneRootProps<T>) {
  const { connection: originalConnection, ...replaneOptions } = options;
  const connectionWithAgent = originalConnection
    ? {
        ...originalConnection,
        agent: originalConnection.agent ?? DEFAULT_AGENT,
      }
    : null;
  const snapshot = await getReplaneSnapshot({
    ...replaneOptions,
    connection: connectionWithAgent,
  });

  return (
    <ReplaneProvider connection={connectionWithAgent} snapshot={snapshot} {...replaneOptions}>
      {children}
    </ReplaneProvider>
  );
}

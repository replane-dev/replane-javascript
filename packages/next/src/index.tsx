/**
 * @replanejs/next - Next.js SDK for Replane
 *
 * This package provides SSR-optimized integration for Next.js applications.
 * It supports both App Router (React Server Components) and Pages Router.
 *
 * @example App Router (using ReplaneRoot server component)
 * ```tsx
 * // app/layout.tsx
 * import { ReplaneRoot } from "@replanejs/next/server";
 *
 * export default async function RootLayout({ children }) {
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
 *
 * // app/page.tsx (Client Component)
 * "use client";
 * import { useConfig } from "@replanejs/next";
 *
 * export default function Page() {
 *   const theme = useConfig("theme");
 *   return <div>{theme.darkMode ? "Dark" : "Light"}</div>;
 * }
 * ```
 *
 * @example Pages Router
 * ```tsx
 * // pages/_app.tsx
 * import { ReplaneProvider, type ReplaneSnapshot } from "@replanejs/next";
 *
 * export default function App({ Component, pageProps }) {
 *   return (
 *     <ReplaneProvider
 *       snapshot={pageProps.replaneSnapshot}
 *       options={{
 *         baseUrl: process.env.NEXT_PUBLIC_REPLANE_BASE_URL!,
 *         sdkKey: process.env.NEXT_PUBLIC_REPLANE_SDK_KEY!,
 *       }}
 *     >
 *       <Component {...pageProps} />
 *     </ReplaneProvider>
 *   );
 * }
 *
 * // pages/index.tsx
 * import { getReplaneSnapshot, useConfig } from "@replanejs/next";
 *
 * export async function getServerSideProps() {
 *   const snapshot = await getReplaneSnapshot({
 *     baseUrl: process.env.REPLANE_BASE_URL!,
 *     sdkKey: process.env.REPLANE_SDK_KEY!,
 *   });
 *   return { props: { replaneSnapshot: snapshot } };
 * }
 *
 * export default function Page() {
 *   const theme = useConfig("theme");
 *   return <div>{theme.darkMode ? "Dark" : "Light"}</div>;
 * }
 * ```
 *
 * @packageDocumentation
 */

export { ReplaneRoot } from "./root";
export type { ReplaneRootProps } from "./root";

export {
  ReplaneProvider,
  getReplaneSnapshot,
  useReplane,
  useConfig,
  createReplaneHook,
  createConfigHook,
  clearSuspenseCache,
  clearSnapshotCache,
} from "@replanejs/react";

export type {
  ReplaneProviderProps,
  ReplaneProviderWithClientProps,
  ReplaneProviderWithOptionsProps,
  GetReplaneSnapshotOptions,
} from "@replanejs/react";

export {
  createReplaneClient,
  createInMemoryReplaneClient,
  restoreReplaneClient,
  ReplaneError,
  ReplaneErrorCode,
} from "@replanejs/sdk";

export type {
  ReplaneClient,
  ReplaneClientOptions,
  ReplaneSnapshot,
  ReplaneContext,
  ReplaneLogger,
  GetConfigOptions,
  RestoreReplaneClientOptions,
} from "@replanejs/sdk";

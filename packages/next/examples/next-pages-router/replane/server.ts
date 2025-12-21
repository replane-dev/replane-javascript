/**
 * Server-side utilities for fetching Replane snapshots.
 * Use these in getServerSideProps, getStaticProps, or getInitialProps.
 */
import { getReplaneSnapshot, type ReplaneSnapshot } from "@replanejs/next";
import type { AppConfigs } from "./types";

export type { ReplaneSnapshot };

/**
 * Fetches the Replane snapshot with proper typing.
 * Use this in getServerSideProps or getStaticProps.
 *
 * @example
 * ```ts
 * export const getServerSideProps = async () => {
 *   const replaneSnapshot = await fetchReplaneSnapshot();
 *   return { props: { replaneSnapshot } };
 * };
 * ```
 */
export async function fetchReplaneSnapshot(): Promise<ReplaneSnapshot<AppConfigs>> {
  return getReplaneSnapshot<AppConfigs>({
    baseUrl: process.env.REPLANE_BASE_URL!,
    sdkKey: process.env.REPLANE_SDK_KEY!,
  });
}

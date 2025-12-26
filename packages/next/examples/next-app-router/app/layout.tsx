import { ReplaneRoot } from "@replanejs/next";
import type { AppConfigs } from "@/replane/types";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* ReplaneRoot fetches configs on the server and provides them to the client */}
        <ReplaneRoot<AppConfigs>
          connection={{
            baseUrl: process.env.NEXT_PUBLIC_REPLANE_BASE_URL!,
            sdkKey: process.env.NEXT_PUBLIC_REPLANE_SDK_KEY!,
          }}
        >
          {children}
        </ReplaneRoot>
      </body>
    </html>
  );
}

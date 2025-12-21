import { ReplaneRoot } from "@replanejs/next";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/*
          ReplaneRoot fetches configs on the server and enables live updates on the client.
          Use NEXT_PUBLIC_ env vars so they're available on both server and client.
        */}
        <ReplaneRoot
          options={{
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

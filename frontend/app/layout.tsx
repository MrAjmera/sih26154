import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "SIH26154 — GenAI Content Transformation Platform",
  description: "One source, many correctly-formatted outputs.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <Nav />
          {children}
        </StoreProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GlucoStream",
  description: "CGM real-time data platform — engineering demonstration.",
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

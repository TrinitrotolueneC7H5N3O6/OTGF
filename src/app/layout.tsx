import type { Metadata } from "next";
import { Figtree, Syne } from "next/font/google";
import { LatencyHud } from "@/components/shared/LatencyHud";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OTGF — Floor between you and your clients",
  description:
    "The unifying middle layer for on-the-ground businesses to chat with known and unknown clients, and send the photos they already show on the floor.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${figtree.variable} h-full antialiased`}
    >
      <body className="h-full">
        {children}
        <LatencyHud />
      </body>
    </html>
  );
}

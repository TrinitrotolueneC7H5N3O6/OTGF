import type { Metadata } from "next";
import { Figtree, Syne } from "next/font/google";
import { CornerTools } from "@/components/shared/CornerTools";
import { LatencyHud } from "@/components/shared/LatencyHud";
import { SIDEBAR_COLLAPSED_KEY } from "@/lib/workspaceNav";
import "./globals.css";

const NAV_COLLAPSE_BOOT = `(function(){try{var v=localStorage.getItem(${JSON.stringify(SIDEBAR_COLLAPSED_KEY)});if(v==="1"||(v!=="0"&&matchMedia("(max-width:980px)").matches))document.documentElement.setAttribute("data-nav-collapsed","1")}catch(e){}})();`;

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
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NAV_COLLAPSE_BOOT }} />
      </head>
      <body className="h-full">
        {children}
        <CornerTools />
        <LatencyHud />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { FunnelShell } from "@/components/funnel/FunnelShell";

export const metadata: Metadata = {
  title: "Build your funnel — RouteCraft",
};

export default function BuildLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <FunnelShell>{children}</FunnelShell>;
}

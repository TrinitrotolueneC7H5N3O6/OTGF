import { FloorAuthGate } from "@/components/home/SpaceAuthForm";
import { EmployeeDashboard } from "@/components/workspace/EmployeeDashboard";

export default async function DeskLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <FloorAuthGate slug={slug}>
      <EmployeeDashboard slug={slug} />
      {children}
    </FloorAuthGate>
  );
}

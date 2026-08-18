import { FloorAuthGate } from "@/components/home/SpaceAuthForm";
import { EmployeeDashboard } from "@/components/workspace/EmployeeDashboard";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <FloorAuthGate slug={slug}>
      <EmployeeDashboard slug={slug} />
    </FloorAuthGate>
  );
}

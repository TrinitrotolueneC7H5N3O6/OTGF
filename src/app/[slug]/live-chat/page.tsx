import { FloorAuthGate } from "@/components/home/SpaceAuthForm";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

export default async function LiveChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <FloorAuthGate slug={slug}>
      <WorkspaceShell slug={slug} />
    </FloorAuthGate>
  );
}

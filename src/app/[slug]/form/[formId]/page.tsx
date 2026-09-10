import { FormPublicApp } from "@/components/client/FormPublicApp";

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ slug: string; formId: string }>;
}) {
  const { slug, formId } = await params;
  return <FormPublicApp slug={slug} formId={formId} />;
}

export interface FunnelStep {
  path: string;
  label: string;
  eyebrow: string;
}

/** Page-by-page setup sequence for the lead-generation funnel module.
 * Appointments / product-recs modules will get their own sequences later,
 * behind the same shell (see docs/prototype-plan). */
export const LEAD_FUNNEL_STEPS: FunnelStep[] = [
  { path: "/build", label: "Goal", eyebrow: "Step 1 of 7" },
  { path: "/build/business", label: "Business", eyebrow: "Step 2 of 7" },
  { path: "/build/offer", label: "Offer", eyebrow: "Step 3 of 7" },
  { path: "/build/questions", label: "Questions", eyebrow: "Step 4 of 7" },
  { path: "/build/contact", label: "Contact info", eyebrow: "Step 5 of 7" },
  { path: "/build/thanks", label: "Thank you", eyebrow: "Step 6 of 7" },
  { path: "/build/review", label: "Review & publish", eyebrow: "Step 7 of 7" },
];

export function stepIndexForPath(pathname: string): number {
  const idx = LEAD_FUNNEL_STEPS.findIndex((s) => s.path === pathname);
  return idx >= 0 ? idx : 0;
}

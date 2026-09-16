/** RouteCraft funnel builder types. Draft lives client-side (localStorage)
 * until a Funnel/Lead Prisma model is wired up — see docs/prototype-plan. */

export type FunnelGoal = "leads" | "appointments" | "products";

export interface QualifyingQuestion {
  id: string;
  label: string;
}

export interface ContactFieldToggles {
  name: boolean;
  phone: boolean;
  email: boolean;
  zip: boolean;
}

export interface LeadGenFunnelDraft {
  goal: "leads";
  business: {
    name: string;
    industry: string;
  };
  offer: {
    headline: string;
    subheading: string;
    ctaLabel: string;
  };
  questions: QualifyingQuestion[];
  contactFields: ContactFieldToggles;
  thankYou: {
    message: string;
    timeframe: string;
  };
  slug: string;
  publishedAt: string | null;
  updatedAt: string;
}

export interface LeadAnswer {
  questionId: string;
  question: string;
  answer: string;
}

export interface CapturedLead {
  id: string;
  slug: string;
  name: string;
  phone: string;
  email: string;
  zip: string;
  answers: LeadAnswer[];
  createdAt: string;
}

export const QUALIFYING_QUESTION_LIBRARY: QualifyingQuestion[] = [
  { id: "service", label: "What service do you need?" },
  { id: "budget", label: "What's your budget range?" },
  { id: "timeline", label: "When do you want this done?" },
  { id: "zip", label: "What's your zip code / service area?" },
  { id: "how-heard", label: "How did you hear about us?" },
];

export function emptyLeadFunnelDraft(): LeadGenFunnelDraft {
  const now = new Date().toISOString();
  return {
    goal: "leads",
    business: { name: "", industry: "" },
    offer: { headline: "", subheading: "", ctaLabel: "Get my free quote" },
    questions: [],
    contactFields: { name: true, phone: true, email: false, zip: false },
    thankYou: {
      message: "Thanks — we've got your info.",
      timeframe: "We'll call you back within 1 business day.",
    },
    slug: "",
    publishedAt: null,
    updatedAt: now,
  };
}

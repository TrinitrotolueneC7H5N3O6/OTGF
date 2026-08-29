import type { EmailAlertKind, EmailAlerts } from "./types";

export const EMAIL_ALERT_DEFAULTS: EmailAlerts = {
  ownerNewChat: true,
  ownerAwayMessage: true,
  ownerEveryMessage: false,
  ownerStaffOutIntake: true,
  ownerContactCaptured: true,
  customerChatLink: true,
  customerIntakeReceived: true,
  customerConversationCopy: true,
  customerReceipt: true,
};

export const EMAIL_ALERT_OPTIONS: {
  id: EmailAlertKind;
  audience: "owner" | "customer";
  label: string;
  help: string;
}[] = [
  {
    id: "ownerNewChat",
    audience: "owner",
    label: "New customer chats",
    help: "First real message in a new conversation.",
  },
  {
    id: "ownerAwayMessage",
    audience: "owner",
    label: "Messages while away",
    help: "Follow-ups that arrive when live chat is off.",
  },
  {
    id: "ownerStaffOutIntake",
    audience: "owner",
    label: "After-hours intake",
    help: "Name, contact, and details from the away form.",
  },
  {
    id: "ownerContactCaptured",
    audience: "owner",
    label: "Contact details left",
    help: "Email or phone captured for a later reply.",
  },
  {
    id: "ownerEveryMessage",
    audience: "owner",
    label: "Every customer message",
    help: "Noisy. Leave off unless you want a full paper trail.",
  },
  {
    id: "customerChatLink",
    audience: "customer",
    label: "Chat return link",
    help: "Sends the unique link when they ask to email it.",
  },
  {
    id: "customerIntakeReceived",
    audience: "customer",
    label: "Intake received",
    help: "Confirms you got their after-hours request.",
  },
  {
    id: "customerConversationCopy",
    audience: "customer",
    label: "Conversation copy",
    help: "Emails the thread when they leave contact at the end.",
  },
  {
    id: "customerReceipt",
    audience: "customer",
    label: "Receipt copy",
    help: "Payment details if they already shared an email.",
  },
];

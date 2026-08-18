export type NewChatSound = "off" | "chime" | "ping" | "knock";
export type ActiveChatSound = "off" | "soft" | "tap" | "bell";

export type FloorUserPrefs = {
  newChatSound: NewChatSound;
  activeChatSound: ActiveChatSound;
};

const DEFAULTS: FloorUserPrefs = {
  newChatSound: "chime",
  activeChatSound: "soft",
};

const NEW_CHAT_SOUNDS: NewChatSound[] = ["off", "chime", "ping", "knock"];
const ACTIVE_CHAT_SOUNDS: ActiveChatSound[] = ["off", "soft", "tap", "bell"];

function storageKey(slug: string) {
  return `otgf-user-prefs:${slug}`;
}

export function loadFloorPrefs(slug: string): FloorUserPrefs {
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<FloorUserPrefs>;
    return {
      newChatSound: NEW_CHAT_SOUNDS.includes(parsed.newChatSound as NewChatSound)
        ? (parsed.newChatSound as NewChatSound)
        : DEFAULTS.newChatSound,
      activeChatSound: ACTIVE_CHAT_SOUNDS.includes(
        parsed.activeChatSound as ActiveChatSound,
      )
        ? (parsed.activeChatSound as ActiveChatSound)
        : DEFAULTS.activeChatSound,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveFloorPrefs(slug: string, prefs: FloorUserPrefs) {
  try {
    window.localStorage.setItem(storageKey(slug), JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

let audioCtx: AudioContext | null = null;

function ctx() {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

function tone(
  frequency: number,
  start: number,
  duration: number,
  type: OscillatorType,
  gain = 0.08,
) {
  const ac = ctx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function playNewChatSound(kind: NewChatSound) {
  const ac = ctx();
  if (!ac || kind === "off") return;
  const t = ac.currentTime;
  if (kind === "chime") {
    tone(880, t, 0.12, "sine", 0.09);
    tone(1320, t + 0.1, 0.18, "sine", 0.07);
  } else if (kind === "ping") {
    tone(1200, t, 0.08, "triangle", 0.1);
  } else {
    tone(220, t, 0.06, "square", 0.05);
    tone(180, t + 0.09, 0.08, "square", 0.04);
  }
}

export function playActiveChatSound(kind: ActiveChatSound) {
  const ac = ctx();
  if (!ac || kind === "off") return;
  const t = ac.currentTime;
  if (kind === "soft") {
    tone(660, t, 0.1, "sine", 0.05);
  } else if (kind === "tap") {
    tone(440, t, 0.05, "triangle", 0.06);
  } else {
    tone(784, t, 0.08, "sine", 0.07);
    tone(988, t + 0.09, 0.12, "sine", 0.05);
  }
}

export const NEW_CHAT_SOUND_OPTIONS: {
  id: NewChatSound;
  label: string;
}[] = [
  { id: "off", label: "Off" },
  { id: "chime", label: "Chime" },
  { id: "ping", label: "Ping" },
  { id: "knock", label: "Knock" },
];

export const ACTIVE_CHAT_SOUND_OPTIONS: {
  id: ActiveChatSound;
  label: string;
}[] = [
  { id: "off", label: "Off" },
  { id: "soft", label: "Soft" },
  { id: "tap", label: "Tap" },
  { id: "bell", label: "Bell" },
];

"use client";

interface ClientAvatarProps {
  id: string;
  name: string;
}

const DICEBEAR_STYLE = "line-face";
const DICEBEAR_SMILE_MOUTHS = [
  "pleased",
  "shy",
  "smile",
  "smirk",
  "soft",
  "wavy",
].join(",");
const DICEBEAR_BACKGROUNDS = [
  "ffe5ec",
  "dff6ff",
  "e7f9dd",
  "f1e7ff",
  "fff1cd",
].join(",");

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function dicebearUrl(id: string, name: string) {
  const seed = encodeURIComponent(`otgf-${hashSeed(`${id}:${name}`)}`);
  return `https://api.dicebear.com/10.x/${DICEBEAR_STYLE}/svg?seed=${seed}&backgroundColor=${DICEBEAR_BACKGROUNDS}&mouthVariant=${DICEBEAR_SMILE_MOUTHS}`;
}

export function ClientAvatar({ id, name }: ClientAvatarProps) {
  return (
    <span className="client-avatar" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dicebearUrl(id, name)} alt="" loading="lazy" />
    </span>
  );
}

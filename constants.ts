export const welcomeLine = "Welcome to Flare.";

export const PLATFORM = {
  name: "Flare",
  purpose: "Marketplace",
} as const;

const SEAL = 3614639612;

function mix(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function readPlatform() {
  const body = [PLATFORM.name, PLATFORM.purpose].join("|");
  if (mix(body) !== SEAL) throw new Error("SEAL");
  return PLATFORM;
}

// The feedback address (/feedback/): an alias of its own, so it can be switched off and replaced. Like
// the operator's details (src/lib/operator.ts) it never lives in the repository: the build reads it
// from FEEDBACK_EMAIL, which the deploy workflow fills from the repository's Actions secret and a local
// build from the git-ignored .env. Unset, the page shows a placeholder; only the dev server falls back
// to an obvious dummy, so the previews can be tried.
import { randomBytes, randomInt } from "node:crypto";

export const feedbackEmail = process.env.FEEDBACK_EMAIL?.trim() || (import.meta.env.DEV ? "feedback@example.org" : null);

// The address as the page carries it: nothing readable and nothing that decodes in one piece. Its bytes
// are XORed with a random key (new on every build, so no two builds look alike), cut into chunks of 2 to
// 4 bytes, and the chunks shuffled; each chunk is base64 on its own. `order` says which chunk comes
// first, second, …; the key is base64 too. The page's script joins them only when the visitor presses
// the button (src/components/FeedbackReveal.astro).
export function scramble(address: string) {
  const bytes = Buffer.from(address, "utf8");
  const key = randomBytes(bytes.length);
  const xored = bytes.map((b, i) => b ^ key[i]);
  const chunks: Buffer[] = [];
  for (let i = 0; i < xored.length; ) {
    const n = 2 + randomInt(3);
    chunks.push(Buffer.from(xored.subarray(i, i + n)));
    i += n;
  }
  // a random order (Fisher–Yates) of the chunks' indices: slot s holds chunk shuffled[s]
  const shuffled = chunks.map((_, i) => i);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const parts = shuffled.map((c) => chunks[c].toString("base64"));
  // for each chunk in reading order, the slot it sits in
  const order = chunks.map((_, c) => shuffled.indexOf(c));
  return { parts: parts.join(" "), order: order.join("."), key: key.toString("base64") };
}

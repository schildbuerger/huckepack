// An inline script under the site's Content Security Policy (astro.config.mjs): Astro hashes the
// scripts it bundles but not is:inline ones, so a page registers its inline script's hash itself.
// Render the returned code with <script is:inline set:html={…} />, so the hash is of exactly what
// the page carries.
import { createHash } from "node:crypto";

export function inlineScript(astro: { csp?: { insertScriptHash: (hash: `sha256-${string}`) => void } }, code: string) {
  astro.csp?.insertScriptHash(`sha256-${createHash("sha256").update(code).digest("base64")}`);
  return code;
}

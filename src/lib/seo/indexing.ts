/**
 * May search engines and AI crawlers index this deployment?
 *
 * Not yet. The shop is running on an address that is not its final domain, and
 * whatever a crawler indexes now it will keep: a duplicate of the real shop on
 * the wrong host, competing with it the day it moves, plus product copy taken
 * into AI training sets under a name we are leaving.
 *
 * So indexing is OFF unless it is switched on, and it is switched on in one
 * place: `SITE_INDEXING=on` in the server environment (Coolify). Everything
 * that tells a crawler what to do reads this one function — robots.txt, the
 * `X-Robots-Tag` header set by the proxy and the root `<meta name="robots">`.
 *
 * The default is the safe side on purpose. A variable forgotten on a new
 * deployment keeps the site out of the index; the opposite default would put a
 * staging copy into Google the first time someone forgot it.
 *
 * Read at request time, never at build: the Docker build does not see runtime
 * variables, so going live is a restart with the variable set, not a rebuild.
 */
export function indexingAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.SITE_INDEXING?.trim().toLowerCase() === "on";
}

/** The header value sent on every page while indexing is off. */
export const NOINDEX_HEADER = "noindex, nofollow, noarchive";

/**
 * Crawlers named explicitly in the blocked robots.txt.
 *
 * `User-agent: *` already covers them. Some AI crawlers only honour a group
 * that names them, so they are listed too — redundancy that costs nothing.
 */
export const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "CCBot",
  "Bytespider",
  "Applebot-Extended",
  "Amazonbot",
  "meta-externalagent",
] as const;

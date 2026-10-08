import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = readFileSync(join(HERE, "../worker.ts"), "utf8");
const WRANGLER = readFileSync(join(HERE, "../../wrangler.jsonc"), "utf8");

/** Les expressions déclarées dans `triggers.crons` de `wrangler.jsonc`. */
function declaredCrons(): readonly string[] {
  const block = /"crons":\s*\[([\s\S]*?)\]/.exec(WRANGLER);
  if (block === null) {
    throw new Error("triggers.crons introuvable dans wrangler.jsonc");
  }
  return [...block[1]!.matchAll(/"([^"]+)"/g)].map((match) => match[1]!);
}

/** Les constantes `*_CRON` du Worker, nom → expression. */
function workerCrons(): ReadonlyMap<string, string> {
  return new Map(
    [...WORKER.matchAll(/const ([A-Z_]+_CRON) = "([^"]+)";/g)].map(
      (match) => [match[1]!, match[2]!] as const,
    ),
  );
}

/**
 * Les deux listes de crons sont recopiées à la main, et Cloudflare ne
 * transmet que la chaîne : une constante du Worker absente de `wrangler.jsonc`
 * ne se déclenche jamais, et une expression différente part dans le `default`
 * — le recompute — sans que rien ne le dise.
 */
describe("les crons du Worker et de wrangler.jsonc", () => {
  it("chaque constante *_CRON du Worker est déclarée dans wrangler.jsonc", () => {
    const declared = new Set(declaredCrons());
    const missing = [...workerCrons()].filter(([, cron]) => !declared.has(cron));
    expect(missing).toEqual([]);
  });

  it("chaque constante *_CRON a son `case` dans le départage", () => {
    const unrouted = [...workerCrons().keys()].filter((name) => !WORKER.includes(`case ${name}:`));
    expect(unrouted).toEqual([]);
  });

  it("la constitution automatique a son cron PROPRE, au quart (PA3)", () => {
    expect(workerCrons().get("COLLECTION_AUTOPILOT_CRON")).toBe("15 * * * *");
    expect(WORKER).toContain('"admin/accounting/collection/autopilot"');
  });
});

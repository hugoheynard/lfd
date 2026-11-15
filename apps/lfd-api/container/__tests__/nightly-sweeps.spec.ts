import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = readFileSync(join(HERE, "../worker.ts"), "utf8");

/** Le corps d'une fonction du Worker, de sa déclaration à la suivante. */
function bodyOf(name: string): string {
  const start = WORKER.indexOf(`async function ${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = WORKER.indexOf("\nasync function ", start + 1);
  return WORKER.slice(start, next === -1 ? undefined : next);
}

/** Les routes que la passe nocturne poste, dans l'ordre. */
function nightlyPaths(): readonly string[] {
  return [...bodyOf("triggerQualityUploadSweep").matchAll(/^\s+"(admin\/[^"]+)",$/gm)].map(
    (match) => match[1]!,
  );
}

/**
 * Le balayage des photos de contrôle et l'élagage du journal des journées du
 * fournil sont deux routes (la qualité ne porte pas la journée) : le cron
 * nocturne qui n'en appelait qu'une laisserait le journal grossir sans fin.
 */
describe("la passe nocturne des balayages", () => {
  it("le cron nocturne déclenche la passe des balayages", () => {
    expect(WORKER).toMatch(
      /case QUALITY_UPLOAD_SWEEP_CRON:\s*return triggerQualityUploadSweep\(env\);/,
    );
  });

  it("appelle le balayage qualité ET l'élagage du journal du fournil, dans cet ordre", () => {
    const paths = nightlyPaths();
    expect(paths).toContain("admin/production/quality/sweep");
    expect(paths).toContain("admin/production/journal/sweep");
    expect(paths.indexOf("admin/production/journal/sweep")).toBe(
      paths.indexOf("admin/production/quality/sweep") + 1,
    );
  });

  it("chaque route de la passe est postée par la boucle", () => {
    expect(bodyOf("triggerQualityUploadSweep")).toContain("await postSweep(env, token, path);");
  });
});

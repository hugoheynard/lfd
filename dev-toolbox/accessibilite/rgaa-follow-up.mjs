/**
 * **Le suivi d'accessibilité public**, tiré de la grille d'audit RGAA
 * (Hugo, 2026-10-26 — `documentation/accessibilite/grille-audit-rgaa.md`).
 *
 * La grille porte des preuves, des fichiers et des lots : de quoi travailler,
 * pas de quoi publier. Ce module n'en garde que ce que le public peut lire —
 * les corrections, l'état de l'audit et, une fois l'audit fini, les comptes
 * par thématique — et le rend dans la forme du contrat
 * `AccessibilityFollowUpView` (`packages/contracts`). `pnpm rgaa:digest` écrit
 * le résultat dans l'API ; `lint:rgaa-digest` refuse qu'il retarde.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const GRID_PATH = "documentation/accessibilite/grille-audit-rgaa.json";
export const EMBEDDED_PATH =
  "apps/lfd-api/src/b2b/content/infrastructure/embedded/accessibility-follow-up.json";
export const REGENERATE = "pnpm rgaa:digest";

const THEMES = 13;
const STATUSES = { fait: "done", en_cours: "in_progress", prevu: "planned" };
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const MONTH = /^\d{4}-\d{2}$/u;
const CASE_STATUSES = new Set(["C", "NC", "NA", "NT"]);

/** Statut RGAA d'un critère : NC dès une page, NT tant qu'une page l'est, C si une l'est, sinon NA. */
export function criterionStatus(criterion) {
  const values = Object.entries(criterion.resultats).map(([page, result]) => {
    if (!CASE_STATUSES.has(result.statut)) {
      throw new Error(`${criterion.numero} / ${page} : statut inconnu « ${result.statut} »`);
    }
    return result.statut;
  });
  if (values.includes("NC")) return "NC";
  if (values.includes("NT")) return "NT";
  if (values.includes("C")) return "C";
  return "NA";
}

function fail(message) {
  throw new Error(`${GRID_PATH} : ${message}`);
}

function correctionOf(entry, index) {
  const where = `corrections[${index}]`;
  const status = STATUSES[entry.statut];
  if (status === undefined) fail(`${where}.statut doit valoir fait, en_cours ou prevu.`);
  const theme = entry.theme;
  if (theme !== null && !(Number.isInteger(theme) && theme >= 1 && theme <= THEMES)) {
    fail(`${where}.theme doit être un numéro de thématique RGAA (1 à 13), ou null.`);
  }
  if (entry.date !== null && !DAY.test(entry.date ?? "")) {
    fail(`${where}.date doit être AAAA-MM-JJ, ou null.`);
  }
  if (status === "done" && entry.date === null) fail(`${where} : une correction faite est datée.`);
  for (const locale of ["fr", "en", "it"]) {
    const text = entry.libelle?.[locale];
    if (typeof text !== "string" || text.trim() === "") {
      fail(`${where}.libelle.${locale} manque : la boutique l'affiche dans les trois langues.`);
    }
  }
  const { fr, en, it } = entry.libelle;
  return { theme, date: entry.date, status, label: { fr, en, it } };
}

function auditOf(audit) {
  if (audit === undefined || audit === null) fail("la clé audit manque.");
  if (audit.prevu !== null && !MONTH.test(audit.prevu ?? ""))
    fail("audit.prevu : AAAA-MM ou null.");
  if (audit.fait !== null && !DAY.test(audit.fait ?? "")) fail("audit.fait : AAAA-MM-JJ ou null.");
  return { plannedFor: audit.prevu, completedOn: audit.fait };
}

function countsOf(statuses) {
  return {
    compliant: statuses.filter((s) => s === "C").length,
    nonCompliant: statuses.filter((s) => s === "NC").length,
    notApplicable: statuses.filter((s) => s === "NA").length,
  };
}

/**
 * Les comptes, seulement quand l'audit est daté ET qu'aucune case n'est NT :
 * aucun taux n'est publié avant la fin de l'audit (Hugo, 2026-10-26).
 */
function conformityOf(grid, audit) {
  if (audit.completedOn === null) return null;
  const statuses = grid.criteres.map((c) => [c.thematique_numero, criterionStatus(c)]);
  if (statuses.some(([, s]) => s === "NT")) {
    fail(
      "audit.fait est daté, mais des critères restent NT : un audit fini n'a plus de case non testée.",
    );
  }
  const byTheme = Array.from({ length: THEMES }, (_, i) => ({
    theme: i + 1,
    ...countsOf(statuses.filter(([t]) => t === i + 1).map(([, s]) => s)),
  }));
  return { ...countsOf(statuses.map(([, s]) => s)), byTheme };
}

/** Le suivi public d'une grille déjà lue. */
export function buildFollowUp(grid) {
  if (!Array.isArray(grid.corrections)) fail("la clé corrections doit être une liste.");
  const audit = auditOf(grid.audit);
  return {
    corrections: grid.corrections.map(correctionOf),
    audit,
    conformity: conformityOf(grid, audit),
  };
}

/** Le fichier que l'API embarque, tel qu'il doit être écrit. */
export function followUpJson(root = ROOT) {
  const grid = JSON.parse(readFileSync(join(root, GRID_PATH), "utf8"));
  return `${JSON.stringify(buildFollowUp(grid), null, 2)}\n`;
}

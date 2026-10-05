/**
 * **Les paniers du client de référence** — ce qu'il reprend, échéance après
 * échéance.
 *
 * Sortis de `orders.seed.ts` le 2026-10-05, quand la journée du jour a été
 * découpée en étapes (`documentation/order/plan-jeu-de-donnees-par-etapes.md`) :
 * la file du comptoir (`counter-day.seed.ts`) et l'historique tirent leurs
 * lignes de la même recette, et deux recettes finiraient par se contredire.
 * Pur : aucune lecture, aucune écriture.
 */

/**
 * L'historique : une commande tous les dix jours sur deux mois. Assez pour que
 * « ses habitudes » veuille dire quelque chose, pas au point de noyer la liste.
 */
export const HISTORY_COUNT = 6;
export const HISTORY_EVERY_DAYS = 10;

/**
 * Ce que cette maison reprend **presque toujours** — le cœur de ses habitudes,
 * et ce que l'écran de saisie du back-office doit proposer en premier.
 */
const CORE: readonly { readonly sku: string; readonly base: number }[] = [
  { sku: "VIE-001", base: 40 }, // Croissant
  { sku: "VIE-002", base: 30 }, // Pain au chocolat
  { sku: "PAI-001", base: 25 }, // Baguette tradition
  { sku: "VIE-009", base: 12 }, // Pain au lait
];

/** Pris de temps en temps — la queue de distribution, celle qui passe après. */
const OCCASIONAL: readonly { readonly sku: string; readonly every: number }[] = [
  { sku: "VIE-005", every: 2 }, // Chausson aux pommes
  { sku: "PAI-013", every: 3 }, // Pain complet
];

/**
 * Un produit **abandonné** en cours de route : présent au début, plus jamais
 * ensuite. Il exerce le cas « commandé autrefois » — la liste doit continuer de
 * le montrer, et l'écran de ne plus le proposer si le catalogue le retire.
 */
const ABANDONED = { sku: "VIE-016", untilStep: 2 }; // Sablé suisse

/** Un produit **récent** : rien au début, puis à chaque fois. */
const NEWCOMER = { sku: "VIE-019", fromStep: 4 }; // Gros cookie

/** Tous les SKU que ces paniers citent — ce que le semis vérifie au catalogue AVANT d'écrire. */
export const CORPUS_SKUS: readonly string[] = [
  ...CORE.map((item) => item.sku),
  ...OCCASIONAL.map((item) => item.sku),
  ABANDONED.sku,
  NEWCOMER.sku,
];

/**
 * Les lignes d'une échéance : le cœur qui oscille, plus ce qui va et vient.
 *
 * `step` compte les échéances dans l'ordre du TEMPS — 0 = la plus récente. Des
 * quantités identiques d'une fois sur l'autre feraient mentir toute moyenne
 * calculée dessus, et « les plus repris » ne voudrait rien dire.
 */
export function linesFor(step: number): { readonly sku: string; readonly quantity: number }[] {
  const lines = CORE.map((item) => ({
    sku: item.sku,
    // Déterministe : deux exécutions du seed ne se contredisent pas.
    quantity: Math.max(1, item.base + ((step * 7) % 11) - 5),
  }));
  for (const item of OCCASIONAL) {
    if (step % item.every === 0) {
      lines.push({ sku: item.sku, quantity: 4 + (step % 5) });
    }
  }
  if (step >= HISTORY_COUNT - ABANDONED.untilStep) {
    lines.push({ sku: ABANDONED.sku, quantity: 6 });
  }
  if (step <= NEWCOMER.fromStep) {
    lines.push({ sku: NEWCOMER.sku, quantity: 3 });
  }
  return lines;
}

/**
 * **Plan de churn déterministe** (pur) — la « recette » des terminaisons, séparée de
 * leur écriture en base. Il préserve TOUS les ratios validés (distribution des motifs
 * jusqu'à la catégorie produit, canal auto/sales, taux de rattrapage par catégorie,
 * délai de réaction qui rétrécit) tout en **densifiant** assez les rattrapages, étalés
 * sur les semaines récentes, pour qu'un boxplot **hebdo × catégorie** ait de vraies
 * boîtes dans chaque case.
 */

/** Fenêtre d'analyse (semaines). */
export const WEEKS = 13;
/** Les rattrapages remplissent les semaines récentes (densité du boxplot hebdo). */
const RECOV_FROM = 6;
/** Le délai de réaction baisse de 40 % du début à la fin (on réagit plus vite). */
const SHRINK = 0.4;

/** Une occurrence de terminaison : motif + sous-motif + détail + canal de rattrapage. */
export interface PlanPart {
  readonly reason: string;
  readonly sub: string;
  readonly detail: string;
  readonly via: string;
}

/** Une résiliation confirmée planifiée (→ société résiliée + sunburst), datée en semaine. */
export interface ConfirmedItem {
  readonly part: PlanPart;
  readonly week: number;
}

/** Une tentative rattrapée planifiée (→ taux + délai), datée + son délai de réaction. */
export interface RecoveredItem {
  readonly part: PlanPart;
  readonly week: number;
  readonly delayDays: number;
}

/** Le plan complet : confirmées + rattrapées. */
export interface LossPlan {
  readonly confirmed: readonly ConfirmedItem[];
  readonly recovered: readonly RecoveredItem[];
}

/** Une sous-raison pondérée (alimente le sunburst). */
interface SubW {
  readonly sub: string;
  readonly detail?: string;
  readonly w: number;
}

/** Config de churn d'une catégorie (préserve taux + délai + sous-raisons). */
interface Cat {
  readonly reason: string;
  /** Taux de rattrapage préservé (rattrapées / tentatives). */
  readonly rate: number;
  /** Nombre de rattrapages (leurs délais alimentent le boxplot hebdo). */
  readonly recovered: number;
  /** Délai médian (jours) le plus ancien — rétrécit vers le présent. */
  readonly baseDelay: number;
  /** Demi-largeur de la boîte (dispersion intra-case, jours). */
  readonly spread: number;
  /** Canal de rattrapage majoritaire. */
  readonly via: "auto" | "sales";
  readonly subs: readonly SubW[];
}

/**
 * Catégories de départ. Contraste préservé : le **concurrent** domine le volume (bas
 * taux), le **tarif** se rattrape le mieux et **vite**, la **qualité** met du temps,
 * la **cessation** ne se rattrape quasi jamais. Seules price/competitor/quality ont
 * assez de rattrapages pour un boxplot hebdo.
 */
const CATS: readonly Cat[] = [
  {
    reason: "price",
    rate: 0.65,
    recovered: 28,
    baseDelay: 4,
    spread: 1.5,
    via: "auto",
    subs: [
      { sub: "delivery_cost", w: 3 },
      { sub: "catalog_price", w: 1 },
    ],
  },
  {
    reason: "competitor",
    rate: 0.35,
    recovered: 21,
    baseDelay: 6,
    spread: 2,
    via: "sales",
    subs: [
      { sub: "better_price", detail: "beverages", w: 5 },
      { sub: "better_price", detail: "wine_spirits", w: 3 },
      { sub: "better_price", detail: "grocery", w: 1 },
      { sub: "better_price", detail: "fresh", w: 1 },
      { sub: "better_offer", w: 2 },
      { sub: "proximite", w: 2 },
    ],
  },
  {
    reason: "quality",
    rate: 0.58,
    recovered: 21,
    baseDelay: 13,
    spread: 3,
    via: "sales",
    subs: [
      { sub: "product_quality", w: 2 },
      { sub: "service", w: 1 },
    ],
  },
  {
    reason: "closure",
    rate: 0.1,
    recovered: 1,
    baseDelay: 12,
    spread: 2,
    via: "sales",
    subs: [
      { sub: "business_closure", w: 5 },
      { sub: "relocation", w: 4 },
    ],
  },
  {
    reason: "no_need",
    rate: 0.5,
    recovered: 1,
    baseDelay: 6,
    spread: 1,
    via: "auto",
    subs: [{ sub: "seasonal", w: 1 }],
  },
];

/** Déplie des sous-raisons pondérées en une liste de longueur `count` (round-robin). */
function expandSubs(
  subs: readonly SubW[],
  count: number,
): ReadonlyArray<{ sub: string; detail: string }> {
  const flat: { sub: string; detail: string }[] = [];
  for (const s of subs) {
    for (let i = 0; i < s.w; i += 1) {
      flat.push({ sub: s.sub, detail: s.detail ?? "" });
    }
  }
  return Array.from({ length: count }, (_, i) => flat[i % flat.length] ?? { sub: "", detail: "" });
}

/** Semaine d'une confirmée (front-chargée : plus de confirmées tôt → le taux monte). */
function confirmedWeek(i: number, total: number): number {
  const t = total > 0 ? i / total : 0;
  return Math.min(WEEKS - 1, Math.floor(t * t * WEEKS));
}

/** Délai de réaction (jours) : rétrécit avec la semaine + dispersion intra-case + outlier. */
function reactionDelay(cat: Cat, week: number, m: number): number {
  if (cat.reason === "price" && m % 11 === 5) {
    return 15; // un sauvetage tarif qui a traîné (outlier haut)
  }
  const span = WEEKS - 1 - RECOV_FROM;
  const progress = span > 0 ? (week - RECOV_FROM) / span : 0;
  const base = cat.baseDelay * (1 - SHRINK * progress);
  const jitter = (cat.spread * ((m % 5) - 2)) / 2;
  return Math.max(1, Math.round(base + jitter));
}

/** Canal d'un rattrapage : majoritairement `cat.via`, ~1 sur 4 dans l'autre. */
function via(cat: Cat, m: number): string {
  const other = cat.via === "auto" ? "sales" : "auto";
  return m % 4 === 0 ? other : cat.via;
}

/**
 * Construit le plan de churn (déterministe). Par catégorie : les **confirmées** sont
 * déduites du taux (`recovered·(1−rate)/rate`), front-chargées dans le temps ; les
 * **rattrapées** étalées sur les semaines récentes avec un délai qui rétrécit.
 */
export function buildLossPlan(): LossPlan {
  const confirmed: ConfirmedItem[] = [];
  const recovered: RecoveredItem[] = [];
  for (const cat of CATS) {
    const confCount = Math.round((cat.recovered * (1 - cat.rate)) / cat.rate);
    const confSubs = expandSubs(cat.subs, confCount);
    for (let i = 0; i < confCount; i += 1) {
      const s = confSubs[i] ?? { sub: "", detail: "" };
      confirmed.push({
        part: { reason: cat.reason, sub: s.sub, detail: s.detail, via: "" },
        week: confirmedWeek(i, confCount),
      });
    }
    const recSubs = expandSubs(cat.subs, cat.recovered);
    for (let m = 0; m < cat.recovered; m += 1) {
      const s = recSubs[m] ?? { sub: "", detail: "" };
      const week = RECOV_FROM + (m % (WEEKS - RECOV_FROM));
      recovered.push({
        part: { reason: cat.reason, sub: s.sub, detail: s.detail, via: via(cat, m) },
        week,
        delayDays: reactionDelay(cat, week, m),
      });
    }
  }
  return { confirmed, recovered };
}

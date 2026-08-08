import type {
  TerminationReason,
  TerminationReasonNode,
  TerminationRecovery,
  TerminationStatsView,
  TerminationSubReasonCount,
} from "@lfd/contracts";

/** Ligne brute d'une terminaison (lecture). */
export interface TerminationRow {
  readonly reason: string;
  readonly subReason: string;
  readonly outcome: string;
}

interface Sub {
  readonly code: string;
  readonly label: string;
}

/**
 * Taxonomie des raisons de départ (v1 en dur ; référentiel « activité »-like plus
 * tard) : chaque catégorie porte ses **sous-raisons**. `subReason` vide ou inconnu
 * retombe sur « Non précisé ».
 */
const TAXONOMY: ReadonlyArray<{ reason: TerminationReason; label: string; subs: readonly Sub[] }> =
  [
    {
      reason: "price",
      label: "Tarif",
      subs: [
        { code: "delivery_cost", label: "Livraison trop chère" },
        { code: "catalog_price", label: "Catalogue trop cher" },
        { code: "no_incentive", label: "Manque d'incentive" },
      ],
    },
    {
      reason: "competitor",
      label: "Concurrent",
      subs: [
        { code: "better_price", label: "Meilleur prix ailleurs" },
        { code: "better_offer", label: "Meilleure offre / service" },
      ],
    },
    {
      reason: "closure",
      label: "Cessation d'activité",
      subs: [
        { code: "business_closure", label: "Fermeture" },
        { code: "relocation", label: "Déménagement hors zone" },
      ],
    },
    {
      reason: "quality",
      label: "Qualité / service",
      subs: [
        { code: "product_quality", label: "Qualité produit" },
        { code: "service", label: "Service / SAV" },
        { code: "delivery_reliability", label: "Fiabilité livraison" },
      ],
    },
    {
      reason: "no_need",
      label: "Plus de besoin",
      subs: [
        { code: "seasonal", label: "Fin de saison" },
        { code: "volume_drop", label: "Baisse d'activité" },
      ],
    },
    {
      reason: "unresponsive",
      label: "Injoignable",
      subs: [{ code: "unreachable", label: "Injoignable" }],
    },
    { reason: "other", label: "Autre", subs: [{ code: "other", label: "Autre" }] },
  ];

const REASONS = TAXONOMY.map((t) => ({ reason: t.reason, label: t.label }));
const KNOWN = new Set<string>(REASONS.map((r) => r.reason));
const UNSPECIFIED = "Non précisé";

/**
 * **Analytics de churn** (pure) : le **sunburst** des résiliations confirmées
 * (raison → sous-raison) et le **taux de rattrapage** (rattrapées / tentatives)
 * global et par catégorie. Raison/sous-raison inconnues retombent sur `other` /
 * « Non précisé ». Déterministe.
 */
export function computeTerminationStats(rows: readonly TerminationRow[]): TerminationStatsView {
  const attempts = new Map<TerminationReason, number>();
  const recovered = new Map<TerminationReason, number>();
  // Confirmées : par raison, puis par libellé de sous-raison.
  const subs = new Map<TerminationReason, Map<string, number>>();
  for (const row of rows) {
    const reason = normalizeReason(row.reason);
    bump(attempts, reason);
    if (row.outcome === "recovered") {
      bump(recovered, reason);
    } else {
      bumpSub(subs, reason, subLabel(reason, row.subReason));
    }
  }
  return {
    reasons: buildReasons(subs),
    recovery: recovery("all", "Global", total(attempts), total(recovered)),
    recoveryByReason: REASONS.map((r) =>
      recovery(r.reason, r.label, attempts.get(r.reason) ?? 0, recovered.get(r.reason) ?? 0),
    ).filter((r) => r.attempts > 0),
  };
}

/** Arbre raison → sous-raisons, trié par le poids des catégories, vides exclues. */
function buildReasons(subs: Map<TerminationReason, Map<string, number>>): TerminationReasonNode[] {
  return TAXONOMY.map((t) => {
    const bucket = subs.get(t.reason) ?? new Map<string, number>();
    const children: TerminationSubReasonCount[] = [...bucket.entries()].map(([label, count]) => ({
      subReason: label,
      label,
      count,
    }));
    const count = children.reduce((sum, c) => sum + c.count, 0);
    return { reason: t.reason, label: t.label, count, children };
  }).filter((node) => node.count > 0);
}

/** Libellé d'une sous-raison connue de la catégorie, sinon « Non précisé ». */
function subLabel(reason: TerminationReason, code: string): string {
  const found = TAXONOMY.find((t) => t.reason === reason)?.subs.find((s) => s.code === code);
  return found?.label ?? UNSPECIFIED;
}

function recovery(
  reason: TerminationReason | "all",
  label: string,
  attempts: number,
  recovered: number,
): TerminationRecovery {
  return { reason, label, attempts, recovered, rate: attempts > 0 ? recovered / attempts : 0 };
}

function normalizeReason(raw: string): TerminationReason {
  return KNOWN.has(raw) ? (raw as TerminationReason) : "other";
}

function bump(map: Map<TerminationReason, number>, reason: TerminationReason): void {
  map.set(reason, (map.get(reason) ?? 0) + 1);
}

function bumpSub(
  subs: Map<TerminationReason, Map<string, number>>,
  reason: TerminationReason,
  label: string,
): void {
  const bucket = subs.get(reason) ?? new Map<string, number>();
  bucket.set(label, (bucket.get(label) ?? 0) + 1);
  subs.set(reason, bucket);
}

function total(map: Map<TerminationReason, number>): number {
  let sum = 0;
  for (const value of map.values()) {
    sum += value;
  }
  return sum;
}

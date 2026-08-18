import type { TerminationReason } from "@lfd/contracts";

/** Un nœud de la taxonomie : un code, un libellé, d'éventuels sous-niveaux. */
export interface Sub {
  readonly code: string;
  readonly label: string;
  readonly subs?: readonly Sub[];
}

/**
 * Taxonomie des raisons de départ (v1 en dur ; référentiel « activité »-like plus
 * tard). Profondeur variable : la plupart des sous-raisons sont des feuilles, mais
 * **« Meilleur prix ailleurs »** se détaille en **catégorie produit** (3ᵉ anneau).
 * Codes inconnus à un niveau retombent sur « Non précisé ».
 */
export const TAXONOMY: ReadonlyArray<{
  reason: TerminationReason;
  label: string;
  subs: readonly Sub[];
}> = [
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
      {
        code: "better_price",
        label: "Meilleur prix ailleurs",
        subs: [
          { code: "beverages", label: "Boissons" },
          { code: "wine_spirits", label: "Vins & spiritueux" },
          { code: "grocery", label: "Épicerie" },
          { code: "fresh", label: "Frais / traiteur" },
        ],
      },
      { code: "better_offer", label: "Meilleure offre / service" },
      { code: "proximite", label: "Concurrent de proximité" },
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

/** Les catégories de départ dans l'ordre de la taxonomie (raison + libellé). */
export const REASONS = TAXONOMY.map((t) => ({ reason: t.reason, label: t.label }));

const KNOWN = new Set<string>(REASONS.map((r) => r.reason));

/** Libellé des sous-raisons/détails non reconnus. */
export const UNSPECIFIED = "Non précisé";

/** Raison connue, sinon `other` (jamais une valeur libre). */
export function normalizeReason(raw: string): TerminationReason {
  return KNOWN.has(raw) ? (raw as TerminationReason) : "other";
}

/** Sous-raisons déclarées pour une catégorie. */
export function subsOf(reason: TerminationReason): readonly Sub[] {
  return TAXONOMY.find((t) => t.reason === reason)?.subs ?? [];
}

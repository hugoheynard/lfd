import type { MediaThreshold, MediaThresholdKey, MediaThresholdState } from "@lfd/ops-contract";

/**
 * **Les seuils de la médiathèque** — pur, donc testé aux bornes.
 *
 * Toutes les mesures partent du même chiffre, le nombre d'images au fonds :
 * c'est la borne SUPÉRIEURE de toute lecture filtrée. Un tri par emplois sur
 * tout le fonds est le pire cas ; le jour où le fonds dépasse la limite, un
 * filtre large la dépasse aussi.
 */

/**
 * Le tri par emplois et le filtre « inutilisées » refusent au-delà de cette
 * quantité d'images filtrées (409, « restreignez d'abord »).
 * Source : `documentation/mediatheque/mediatheque.md` §5 ; recopié de
 * `MAX_RANKED_IMAGES` (`media/domain/services/rank-library.ts`), qu'`ops` n'a
 * pas le droit d'importer (vérifié le 2026-10-11 : 5000).
 */
export const RANKED_SORT_LIMIT = 5_000;

/**
 * Au-delà, la frise des couleurs demande une pré-agrégation. Estimation, pas
 * mesure. Source : `documentation/mediatheque/mediatheque.md` §9 bis.
 */
export const PALETTE_STRIP_LIMIT = 20_000;

/**
 * Transformations uniques par image : deux largeurs × deux rôles.
 * Source : `documentation/ops/cloudflare-images.md` §5.
 */
export const TRANSFORMATIONS_PER_IMAGE = 4;

/**
 * Le palier gratuit de Cloudflare Images, en transformations uniques par mois.
 * Source : `documentation/ops/cloudflare-images.md` §5.
 */
export const FREE_TRANSFORMATIONS_PER_MONTH = 5_000;

/** `attention` à partir de cette part de la limite. */
export const ATTENTION_RATIO = 0.8;

/**
 * Le jugement : `exceeded` dès que la limite est ATTEINTE — à la limite exacte,
 * l'image suivante fait basculer, et le geste est donc dû maintenant.
 */
export function thresholdState(measured: number, limit: number): MediaThresholdState {
  if (measured >= limit) {
    return "exceeded";
  }
  return measured >= limit * ATTENTION_RATIO ? "attention" : "ok";
}

interface ThresholdSpec {
  readonly key: MediaThresholdKey;
  readonly label: string;
  readonly limit: number;
  readonly unit: string;
  readonly estimated: boolean;
  readonly source: string;
  /** Le geste de sortie — ce qu'on fait avant ou après avoir franchi. */
  readonly exit: string;
}

const RANKED_SORT: ThresholdSpec = {
  key: "ranked-sort",
  label: "Tri par emplois",
  limit: RANKED_SORT_LIMIT,
  unit: "images",
  estimated: false,
  source: "documentation/mediatheque/mediatheque.md §5",
  exit: "Restreindre avant de trier : mot-clé, période ou recherche, puis trier par emplois.",
};

const PALETTE_STRIP: ThresholdSpec = {
  key: "palette-strip",
  label: "Frise des couleurs",
  limit: PALETTE_STRIP_LIMIT,
  unit: "images",
  estimated: false,
  source: "documentation/mediatheque/mediatheque.md §9 bis",
  exit: "Pré-agréger la frise : le calcul à la lecture ne tiendra plus (limite estimée).",
};

const TRANSFORMATIONS: ThresholdSpec = {
  key: "transformations",
  label: "Transformations Cloudflare",
  limit: FREE_TRANSFORMATIONS_PER_MONTH,
  unit: "/mois",
  estimated: true,
  source: "documentation/ops/cloudflare-images.md §5",
  exit: "Souscrire Images & Stream — cf. cloudflare-images.md §5 : au-delà du palier gratuit, facturé ou arrêté.",
};

/** Les trois seuils, dans l'ordre où ils seront atteints. */
export function mediaThresholds(images: number): readonly MediaThreshold[] {
  return [
    judge(TRANSFORMATIONS, images * TRANSFORMATIONS_PER_IMAGE),
    judge(RANKED_SORT, images),
    judge(PALETTE_STRIP, images),
  ];
}

function judge(spec: ThresholdSpec, measured: number): MediaThreshold {
  const state = thresholdState(measured, spec.limit);
  return {
    key: spec.key,
    label: spec.label,
    measured,
    limit: spec.limit,
    unit: spec.unit,
    estimated: spec.estimated,
    state,
    message: messageOf(state, spec),
    source: spec.source,
  };
}

function messageOf(state: MediaThresholdState, spec: ThresholdSpec): string {
  const percent = `${Math.round(ATTENTION_RATIO * 100)} %`;
  switch (state) {
    case "ok":
      return `Sous ${percent} de la limite. Rien à faire.`;
    case "attention":
      return `Au-delà de ${percent} de la limite. À prévoir : ${spec.exit}`;
    case "exceeded":
      return `Limite atteinte. ${spec.exit}`;
  }
}

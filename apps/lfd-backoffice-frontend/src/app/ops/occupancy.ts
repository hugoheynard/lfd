import type { TrafficWindow } from '@lfd/ops-contract';

/**
 * **L'occupation d'un nœud** — ce qui donne sa couleur à un lien de la carte.
 *
 * La règle du design (§13) tient en une phrase : *la couleur vient d'un rapport
 * d'occupation, jamais d'un compteur de hits*. Un trait qui rougit parce que le
 * trafic monte alors que tout va bien serait pire qu'inutile — il apprendrait à
 * ignorer la couleur, et le jour où elle veut dire quelque chose, personne ne la
 * regarderait plus.
 *
 * Et le plafond n'est pas un débit : les containers ne facturent ni ne limitent
 * à la requête, ils saturent **une instance**. Ce qu'on mesure, c'est donc la
 * pression sur cette instance, pas le volume qui la traverse.
 */

/**
 * La latence à partir de laquelle on considère l'instance **saturée**.
 *
 * Une seconde au p95 sur une API JSON qui répond d'ordinaire en dizaines de
 * millisecondes : à ce stade il y a une file d'attente, pas une requête lente.
 */
export const P95_SATURATED_MS = 1000;

/** En dessous, la latence ne dit rien : c'est du bruit de mesure, pas de la pression. */
export const P95_CALM_MS = 120;

/** Ce sur quoi l'occupation est établie — parce qu'une jauge sans source se croit. */
export type OccupancyBasis = 'latence' | 'rejets' | 'aucune mesure';

export type OccupancyTone = 'calm' | 'busy' | 'strained' | 'saturated';

export interface Occupancy {
  /** 0..1 — la part du plafond atteinte. */
  readonly ratio: number;
  readonly tone: OccupancyTone;
  readonly basis: OccupancyBasis;
}

/** Ramène une valeur dans [0, 1] — une jauge hors bornes ne se lit plus. */
function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * La pression de latence : `0` sous le seuil calme, `1` à la saturation, et
 * proportionnelle entre les deux. C'est le **premier** signe — une file
 * d'attente se voit toujours avant de déborder.
 */
function latencyPressure(p95Ms: number): number {
  return clamp((p95Ms - P95_CALM_MS) / (P95_SATURATED_MS - P95_CALM_MS));
}

/**
 * La pression de rejet : la part de requêtes que le throttler a refusées.
 *
 * Un nœud qui rejette est **par définition** à son plafond déclaré — c'est même
 * la seule mesure d'occupation qui ne s'interprète pas. Elle ne rend pas le nœud
 * malade pour autant : refuser est le système qui fonctionne (les `429` ne
 * comptent nulle part comme des erreurs). Ici on ne parle pas de santé, on parle
 * de charge, et à ce titre le rejet est le signal le plus net qui soit.
 */
function throttlePressure(traffic: TrafficWindow): number {
  return traffic.requests <= 0 ? 0 : clamp(traffic.throttled / traffic.requests);
}

function toneOf(ratio: number): OccupancyTone {
  if (ratio >= 0.8) {
    return 'saturated';
  }
  if (ratio >= 0.5) {
    return 'strained';
  }
  if (ratio > 0) {
    return 'busy';
  }
  return 'calm';
}

/**
 * L'occupation d'un nœud d'après ce que la gateway a vu.
 *
 * `undefined` (nœud non observé) ou fenêtre vide ⇒ **aucune mesure**, ratio nul.
 * On ne devine pas une charge : un lien gris qui dit « je ne sais pas » vaut
 * mieux qu'un lien vert qui dit « tout va bien » sans rien avoir mesuré.
 *
 * ⚠️ La **concurrence en vol** manque encore (elle viendra du heartbeat, J6).
 * C'est pourquoi `basis` voyage avec le ratio : l'écran doit pouvoir dire sur
 * quoi il se prononce, et ne pas laisser croire à une jauge de CPU.
 */
export function occupancyOf(traffic: TrafficWindow | undefined): Occupancy {
  if (traffic === undefined || traffic.requests <= 0) {
    return { ratio: 0, tone: 'calm', basis: 'aucune mesure' };
  }
  const latency = latencyPressure(traffic.p95Ms);
  const throttle = throttlePressure(traffic);
  // Le pire des deux : deux plafonds différents, et c'est le plus proche qui
  // décide. Les moyenner diluerait un rejet massif dans une latence honnête.
  const ratio = Math.max(latency, throttle);
  return {
    ratio,
    tone: toneOf(ratio),
    basis: ratio === 0 ? 'aucune mesure' : throttle >= latency ? 'rejets' : 'latence',
  };
}

/** Ce que la case d'un nœud affiche sous son pourcentage, et ce qu'elle explique. */
export interface OccupancyReading {
  /** La valeur réelle qui fait le pourcentage — « p95 470 ms », « 12 % en 429 ». */
  readonly measure: string;
  /** Une phrase pour l'infobulle et le lecteur d'écran. */
  readonly sentence: string;
}

/**
 * La mesure **réelle** derrière le pourcentage, ou `null` sans mesure.
 *
 * Le 2026-10-12, Hugo a lu « 40 % » sur la carte comme un CPU de Cloudflare :
 * un pourcentage nu se rattache à la jauge la plus connue, pas à la nôtre. On
 * affiche donc la grandeur qui le produit, et la phrase dit ce qu'il n'est pas.
 */
export function occupancyReading(
  traffic: TrafficWindow | undefined,
  occupancy: Occupancy,
): OccupancyReading | null {
  if (traffic === undefined || occupancy.basis === 'aucune mesure') {
    return null;
  }
  const percent = Math.round(occupancy.ratio * 100);
  const caveat = 'Ce n’est ni un CPU ni une mémoire : c’est la pression vue par la gateway.';
  if (occupancy.basis === 'rejets') {
    const share = Math.round((traffic.throttled / traffic.requests) * 100);
    return {
      measure: `${share} % en 429`,
      sentence: `Occupation ${percent} % d’après les rejets : ${share} % des requêtes refusées par le throttler (429). ${caveat}`,
    };
  }
  const p95 = Math.round(traffic.p95Ms);
  return {
    measure: `p95 ${p95} ms`,
    sentence: `Occupation ${percent} % d’après la latence : p95 ${p95} ms, entre ${P95_CALM_MS} ms (0 %) et ${P95_SATURATED_MS} ms (100 %). ${caveat}`,
  };
}

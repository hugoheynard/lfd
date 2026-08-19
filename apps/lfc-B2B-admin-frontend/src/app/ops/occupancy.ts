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
 * L'occupation d'un nœud d'après ce que la passerelle a vu.
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

import { Injectable } from "@nestjs/common";
import { VITAL_MAX, WEB_VITALS, type WebVitalName, type WebVitalSample } from "@lfd/ops-contract";

/**
 * **Ce que les navigateurs viennent de rapporter**, gardé en mémoire.
 *
 * En mémoire et non en base, pour la raison chiffrée au §28 : une écriture par
 * mesure ferait trois opérations Prisma par visite. Sur la boutique, ce serait
 * le poste de dépense le plus cher du forfait — pour trois nombres qu'on ne lit
 * qu'agrégés, sur un écran de diagnostic.
 *
 * Ce qu'on perd est assumé : les mesures disparaissent au redémarrage, et il n'y
 * a pas d'historique. Ce qu'on garde répond à la seule question posée — « en ce
 * moment, qu'est-ce que les gens vivent ? ».
 */

/** La fenêtre glissante. Assez large pour lisser, assez courte pour être « en ce moment ». */
export const VITALS_WINDOW_MS = 30 * 60 * 1000;

/**
 * Combien d'échantillons au plus par front et par mesure.
 *
 * Borné **par construction**, comme le tampon de journal : une file qui grandit
 * sans fin dans un process qui ne redémarre pas est une fuite mémoire déguisée
 * en outil de diagnostic. Deux cents suffisent largement à un 75ᵉ centile, et
 * pèsent quelques kilo-octets pour toute la flotte.
 */
export const VITALS_CAPACITY = 200;

interface Reading {
  readonly at: number;
  readonly value: number;
}

@Injectable()
export class VitalsStore {
  private readonly readings = new Map<string, Reading[]>();

  /** Retient une mesure. Les valeurs hors bornes sont **jetées**, pas ramenées. */
  record(sample: WebVitalSample, nowMs: number): void {
    if (!Number.isFinite(sample.value) || sample.value < 0) {
      return;
    }
    if (sample.value > VITAL_MAX[sample.metric]) {
      // Ramener à la borne inventerait une mesure plausible là où il n'y en a
      // pas — et une valeur absurde vient d'un onglet resté ouvert toute la
      // nuit ou de quelqu'un qui pousse n'importe quoi sur une route publique.
      return;
    }
    const key = keyOf(sample.front, sample.metric);
    const kept = [...(this.readings.get(key) ?? []), { at: nowMs, value: sample.value }];
    this.readings.set(key, kept.slice(-VITALS_CAPACITY));
  }

  /**
   * Le **75ᵉ centile** de chaque mesure d'un front sur la fenêtre, ou `null`
   * quand personne n'a encore chargé la page.
   *
   * Le 75ᵉ et non la moyenne : c'est le seuil publié des Core Web Vitals, et
   * surtout une poignée de visites rapides suffit à rendre une moyenne
   * flatteuse alors qu'un quart des gens attend.
   */
  percentiles(front: string, nowMs: number): ReadonlyMap<WebVitalName, number> {
    const result = new Map<WebVitalName, number>();
    for (const metric of WEB_VITALS) {
      const fresh = this.fresh(keyOf(front, metric), nowMs);
      if (fresh.length > 0) {
        result.set(metric, percentile75(fresh));
      }
    }
    return result;
  }

  private fresh(key: string, nowMs: number): readonly number[] {
    const kept = this.readings.get(key) ?? [];
    return kept.filter((one) => nowMs - one.at <= VITALS_WINDOW_MS).map((one) => one.value);
  }
}

function keyOf(front: string, metric: WebVitalName): string {
  return `${front}:${metric}`;
}

/** Le 75ᵉ centile par la méthode du plus proche rang — pas d'interpolation à inventer. */
function percentile75(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil(sorted.length * 0.75) - 1;
  return sorted[Math.max(0, rank)] ?? 0;
}

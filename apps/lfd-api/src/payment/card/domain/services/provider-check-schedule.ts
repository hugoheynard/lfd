const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Le temps laissé au webhook avant la première relecture. */
export const PROVIDER_CHECK_GRACE_MS = 5 * MINUTE_MS;

/** Au-delà, un paiement en attente est un abandon, laissé à la relecture humaine. */
export const PROVIDER_CHECK_HORIZON_MS = 7 * DAY_MS;

/** Le plafond d'un passage du balayage. */
export const PROVIDER_CHECK_LIMIT = 50;

/**
 * L'intervalle entre deux relectures, selon l'âge du paiement : 5 minutes la
 * première heure, 1 heure jusqu'à 24 heures, 6 heures ensuite — une ligne
 * restée en attente sept jours est relue une soixantaine de fois.
 */
const INTERVALS: readonly { readonly olderThanMs: number; readonly everyMs: number }[] = [
  { olderThanMs: 0, everyMs: 5 * MINUTE_MS },
  { olderThanMs: HOUR_MS, everyMs: HOUR_MS },
  { olderThanMs: DAY_MS, everyMs: 6 * HOUR_MS },
];

/**
 * Une tranche d'âge : les paiements nés dans `[createdFrom, createdBefore[`
 * sont dus s'ils n'ont jamais été relus, ou relus avant `checkedBefore`.
 */
export interface ProviderCheckBand {
  readonly createdFrom: Date;
  readonly createdBefore: Date;
  readonly checkedBefore: Date;
}

/**
 * **Ce que le balayage des paiements en attente relit à `now`** — les bornes
 * d'âge, les tranches d'intervalle et le plafond, calculés ici pour que
 * l'adaptateur n'ait qu'à les traduire. Les états (`pending | failed`), le
 * rattachement et l'exclusion du rôle `complement` sont des constantes de la
 * requête, pas des paramètres.
 */
export interface ProviderCheckSelection {
  readonly bands: readonly ProviderCheckBand[];
  readonly limit: number;
}

/** Les tranches dues à `now`, de la plus jeune à la plus vieille ; contiguës. */
export function providerCheckSelection(now: Date): ProviderCheckSelection {
  const at = now.getTime();
  const youngest = at - PROVIDER_CHECK_GRACE_MS;
  const oldest = at - PROVIDER_CHECK_HORIZON_MS;
  const bands = INTERVALS.map((interval, index) => {
    const next = INTERVALS[index + 1];
    const createdBefore = Math.min(youngest, at - interval.olderThanMs);
    const createdFrom = next === undefined ? oldest : Math.max(oldest, at - next.olderThanMs);
    return {
      createdFrom: new Date(createdFrom),
      createdBefore: new Date(createdBefore),
      checkedBefore: new Date(at - interval.everyMs),
    };
  }).filter((band) => band.createdFrom < band.createdBefore);
  return { bands, limit: PROVIDER_CHECK_LIMIT };
}

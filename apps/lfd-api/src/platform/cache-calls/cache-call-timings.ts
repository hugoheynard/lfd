/**
 * **Les noms des mesures d'un cache nommé** : `<cache>.round_trip` (durée d'un
 * aller-retour, jusqu'à l'abandon s'il est en retard) et `<cache>.late_finish`
 * (durée FINALE d'un appel abandonné), `<cache>.fallback` (un repli vers la
 * base, étiqueté par `operation` et `reason`, disjoncteur ouvert compris) et
 * `<cache>.breaker_opened` (une ouverture du disjoncteur). Ces deux derniers
 * sont des comptes : leur durée vaut 0. La carte de santé les lit par ces noms ;
 * en changer un éteint une courbe sans que rien ne rougisse.
 */
export interface CacheCallTimingNames {
  readonly roundTrip: string;
  readonly lateFinish: string;
  readonly fallback: string;
  readonly breakerOpened: string;
}

export function cacheCallTimingNames(cache: string): CacheCallTimingNames {
  return {
    roundTrip: `${cache}.round_trip`,
    lateFinish: `${cache}.late_finish`,
    fallback: `${cache}.fallback`,
    breakerOpened: `${cache}.breaker_opened`,
  };
}

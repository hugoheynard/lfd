/**
 * **L'heure d'arrivée que chaque point demande, un jour donné** — ce que
 * l'écran propose quand aucun modèle ne donne d'heure (H-D3 du plan
 * `reassort-boutiques/plan-heure-du-reassort.md`). Sans rien toucher, on
 * retrouve ainsi l'heure que le transfert tient aujourd'hui.
 *
 * Port de lecture déclaré par le réassort, implémenté par les commandes, qui
 * possèdent la règle (`transferDeparture`, `SiteDeadlines`) : une seule
 * vérité sur l'heure à tenir, jamais une copie ici.
 */
export abstract class ResupplyArrivalSuggestions {
  /**
   * `day` : `AAAA-MM-JJ`. Un point ABSENT du résultat n'a pas d'heure
   * calculable ce jour-là (inconnu, ou aucun horaire) : l'écran n'en propose
   * pas, rien n'est inventé.
   */
  abstract requiredArrivals(
    day: string,
    siteIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;
}

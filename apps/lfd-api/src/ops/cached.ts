/**
 * **Un résultat qu'on ne redemande pas trop souvent.**
 *
 * OPS relançait TOUT à chaque lecture de l'écran : quatre sondes tierces, trois
 * sondes de front à deux requêtes chacune, l'appel Auth0. Une douzaine d'appels
 * sortants, toutes les quinze secondes, **multipliés par le nombre de personnes
 * ayant l'écran ouvert**.
 *
 * Ce qui finit par arriver n'est pas une facture, c'est pire : un `429` chez
 * Auth0 ou Stripe, que la carte rendrait « accès refusé » — un incident inventé
 * par l'outil censé les détecter, au moment précis où on le consulte.
 *
 * Deux garanties, et la seconde compte autant que la première :
 *
 * 1. **Un résultat récent est réutilisé** — le plafond d'appels ne dépend plus
 *    du nombre de lecteurs ;
 * 2. **deux lectures simultanées partagent le même appel.** Sans ça, deux
 *    onglets ouverts au même instant repartiraient tous les deux : le cache
 *    laisserait passer exactement la rafale qu'il est là pour empêcher.
 *
 * Un échec n'est PAS mémorisé : on retente au prochain passage. Garder une
 * panne en cache la ferait durer plus longtemps que la panne.
 */
export class Cached<T> {
  private entry: { readonly at: number; readonly value: T } | null = null;
  private pending: Promise<T> | null = null;

  constructor(
    private readonly ttlMs: number,
    private readonly produce: () => Promise<T>,
  ) {}

  read(now: number): Promise<T> {
    const entry = this.entry;
    if (entry !== null && now - entry.at < this.ttlMs) {
      return Promise.resolve(entry.value);
    }
    this.pending ??= this.produce()
      .then((value) => {
        this.entry = { at: now, value };
        return value;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
}

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * **Les chemins qui lisent le catalogue dans l'instantané**
 * (`documentation/caching-usage/plan-materiaux-du-catalogue.md`, § 2.4, § 2.5,
 * lot M1b).
 *
 * Une portée explicite, et pas un adaptateur branché pour tout le monde : le
 * devis et la passation partagent le même service (`OrderLinePricing`) et le
 * même port (`ProductCatalogReader`). Brancher l'instantané sur le port aurait
 * fait lire la passation dans la mémoire, alors qu'elle relit la base pour ce
 * qu'elle écrit et fait foi (§ 2.5). Seuls les chemins qui ENTRENT dans cette
 * portée la lisent : le devis, l'estimation de la saisie, les suggestions.
 * Partout ailleurs — la passation, le rayon (M2), l'administration —, les
 * adaptateurs lisent la base comme avant.
 *
 * La portée ne garde rien : elle dit seulement « ici, l'instantané est permis ».
 * La mémoire décide ensuite (réglage, contexte de requête, numéros).
 */
const scope = new AsyncLocalStorage<true>();

/** Exécute `work` dans la portée de l'instantané. */
export function withCatalogueSnapshot<T>(work: () => Promise<T>): Promise<T> {
  return scope.run(true, work);
}

/** Vrai dans la portée d'un chemin qui lit l'instantané. */
export function insideCatalogueSnapshot(): boolean {
  return scope.getStore() === true;
}

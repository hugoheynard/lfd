/**
 * **L'estampille du principal** — un numéro que la base fait monter à chaque
 * écriture sur `users`, `memberships` ou `companies`
 * (`documentation/caching-usage/plan-principal-en-memoire.md`, §3).
 *
 * Ce n'est pas le code qui la fait monter mais trois déclencheurs : personne
 * ne peut l'oublier, et une écriture faite en SQL à la main la fait monter
 * aussi. Un principal rangé sous un numéro vaut tant que ce numéro est celui
 * que la base rend.
 */
export abstract class PrincipalStampReader {
  /**
   * Le numéro validé courant, ou `null` si la ligne manque — et alors rien ne
   * se garde : une base sans estampille ne dit pas ce qui a bougé.
   */
  abstract read(): Promise<bigint | null>;
}

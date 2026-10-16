/**
 * **Les images qu'affichent les opérations du commerce** — le canal que
 * `b2b/operations` publie pour qui doit savoir si une image sert encore (plan
 * `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`,
 * O3, lot 2).
 *
 * Publié ICI et branché dans `appBootstrap/`, comme
 * `b2b/storefront/channels/media/` : le commerce n'importe pas la médiathèque,
 * et la médiathèque ne lit pas ses tables.
 *
 * Comptent TOUTES les opérations — masquées, finies et **archivées**
 * comprises (plan, « Après le lot 2 », Hugo 2026-10-16) : une masquée revient
 * en boutique d'un geste, une archivée garde son historique, et trier sur
 * l'horloge ferait dépendre la sûreté d'un effacement d'un calcul de date.
 *
 * ⚠️ Branché seulement interrupteur OUVERT (`OPERATIONS_AT_COMMERCE`) : fermé,
 * la même table est comptée comme COPIE (`CatalogMediaCopies`), et la compter
 * deux fois ferait dire « 2 emplois » pour une seule annonce.
 */
export abstract class OperationMediaUsage {
  /** Combien d'opérations portent chacune de ces URL. Une URL que personne ne porte est ABSENTE. */
  abstract usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>>;

  /** **Lesquelles**, nommées — liste vide si aucune, le cas normal d'une image orpheline. */
  abstract usagesOf(url: string): Promise<readonly OperationMediaUsageEntry[]>;
}

/** Une opération du commerce qui montre une image. */
export interface OperationMediaUsageEntry {
  /** Sa clé — l'identité, celle que l'écran « Opérations » ouvre. */
  readonly operationKey: string;
  /** Son nom français, la clé à défaut. Jamais vide. */
  readonly label: string;
}

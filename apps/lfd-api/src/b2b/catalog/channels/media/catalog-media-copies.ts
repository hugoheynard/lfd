/**
 * **Les images que le catalogue du commerce a COPIÉES** — le canal que
 * `b2b/catalog` publie pour qui doit savoir si une image sert encore
 * (décision R18 de la médiathèque, 2026-10-10).
 *
 * 🔴 Une copie n'est pas un porteur comme les autres : elle ne se repointe
 * pas. L'image d'une opération datée est recopiée dans `catalog_operations`
 * au push du catalogue, et seulement là. Après un remplacement, ou un
 * changement d'image de l'opération au référentiel, la boutique sert encore
 * l'ancienne URL jusqu'au prochain push — alors que le référentiel ne la porte
 * plus. Sans ce canal, le ramassage ou le retrait pouvaient effacer du bucket
 * une image que la boutique affiche.
 *
 * Publié ICI et branché ailleurs, comme `b2b/storefront/channels/media/` : le
 * commerce n'importe pas la médiathèque (`b2b → media` est hors de la
 * matrice), et la médiathèque ne lit pas ses tables. `appBootstrap/` relie.
 *
 * Comptent les opérations NON RETIRÉES (`withdrawn_at IS NULL`), finies et
 * masquées comprises — la raison est sur l'adaptateur.
 *
 * ⚠️ Les visuels des articles (`catalog_items.image_url` / `thumbnail_url`)
 * n'y sont PAS : ils sont tenus par la projection vive des visuels, que le
 * remplacement déclenche lui-même (fait `media.asset_described`).
 */
export abstract class CatalogMediaCopies {
  /**
   * Combien d'opérations reçues portent chacune de ces URL. Une URL que
   * personne ne porte est ABSENTE de la carte, pas rendue à zéro.
   */
  abstract usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>>;

  /**
   * **Lesquelles**, nommées par leur nom français — liste vide si aucune,
   * le cas normal.
   */
  abstract copiesOf(url: string): Promise<readonly CatalogMediaCopy[]>;
}

/** Une opération reçue dont la copie montre une image. */
export interface CatalogMediaCopy {
  /** La clé de l'opération — celle du référentiel, que l'envoi transporte. */
  readonly operationKey: string;
  /** Le nom français reçu ; jamais vide (la clé à défaut). */
  readonly name: string;
}

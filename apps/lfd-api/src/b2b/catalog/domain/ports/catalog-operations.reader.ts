import type { CatalogOperationAudience } from "../operation-audience.js";
import type { OperationText } from "../entities/catalog-operation.js";

/**
 * **Une opération telle qu'un vendeur l'applique** : tenue, non masquée, à
 * une clientèle au moins, la surcharge de la réception déjà combinée (D9).
 */
export interface SellableOperation {
  readonly key: string;
  readonly name: OperationText;
  readonly lede: OperationText | null;
  readonly image: { readonly url: string; readonly alt: string } | null;
  readonly announceFrom: Date;
  /** `null` = on commande dès l'annonce. */
  readonly orderFrom: Date | null;
  /** La clôture EFFECTIVE : le plus tôt du référentiel et de la réception. */
  readonly orderUntil: Date;
  /** Jours `AAAA-MM-JJ` ; leur traduction en instant passe par le fuseau de Paris. */
  readonly pickupFrom: string;
  readonly pickupUntil: string;
  /** La clientèle EFFECTIVE — jamais « personne », une telle opération n'est pas rendue. */
  readonly audience: CatalogOperationAudience;
  /** La sélection moins les articles retirés à la réception, dans l'ordre du rayon. */
  readonly skus: readonly string[];
}

/**
 * **Ce que ceux qui VENDENT lisent des opérations** (D5) — pour le lot 3 du
 * plan des opérations datées, qui en fera `operationAccess` (D4).
 *
 * ⚠️ Le 2026-09-24, AUCUN vendeur ne l'appelle encore : le lot 2 pose le
 * lecteur, le lot 3 branche la garde, et les deux partent dans le même merge.
 * Tant que ce n'est pas le cas, `operationOnly` ne restreint aucune vente.
 *
 * Deux questions, deux méthodes : les opérations qu'on applique, et les
 * articles qui ne se vendent QUE par elles (D3). Le lecteur ne tranche rien —
 * « vendable maintenant ? » appartient à la fonction pure du lot 3, avec
 * l'horloge du serveur.
 */
export abstract class CatalogOperationsReader {
  /** Les opérations appliquées, l'annonce la plus récente d'abord (D8). */
  abstract sellableOperations(): Promise<readonly SellableOperation[]>;

  /** Les SKU en vente marqués « vendus seulement pendant une opération ». */
  abstract operationOnlySkus(): Promise<ReadonlySet<string>>;
}

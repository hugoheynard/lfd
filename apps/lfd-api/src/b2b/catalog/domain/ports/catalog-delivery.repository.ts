import type { CatalogDelivery } from "../entities/catalog-delivery.js";

/**
 * La **boîte de réception** du catalogue, vue par ceux qui l'écrivent et la
 * relisent.
 *
 * Port d'écriture : il prend et rend l'**agrégat**, jamais des primitives. Une
 * méthode qui poserait un statut à partir d'une chaîne (`markAccepted(id)`)
 * ferait de ce dépôt un CRUD, et l'invariant « une arrivée close ne se rouvre
 * pas » se retrouverait dans le handler — donc invisible au prochain qui touche
 * la même table.
 */
export abstract class CatalogDeliveryRepository {
  /**
   * L'arrivée en attente, ou `null`.
   *
   * Il y en a **zéro ou une**, jamais deux : c'est un index partiel de Postgres
   * qui le tient, pas cette lecture. Rendre une liste laisserait croire le
   * contraire à chaque appelant.
   */
  abstract pending(): Promise<CatalogDelivery | null>;

  /** Une arrivée par son identifiant — la validation vise celle qu'elle a lue. */
  abstract byId(id: string): Promise<CatalogDelivery | null>;

  /**
   * Écrit l'agrégat dans l'état où il est.
   *
   * ⚠️ Une **livraison** n'est pas un `save` de plus : elle doit clore l'arrivée
   * en attente et poser la nouvelle **dans la même transaction**, sinon l'index
   * d'unicité refuse la seconde écriture et le PIM voit un échec là où il a
   * livré. C'est {@link deliver} qui porte ce geste, et lui seul.
   */
  abstract save(delivery: CatalogDelivery): Promise<void>;

  /**
   * Une nouvelle livraison **remplace** l'arrivée en attente.
   *
   * Le geste est atomique par nécessité, pas par élégance : entre le
   * remplacement de l'ancienne et l'insertion de la nouvelle, l'index partiel
   * n'admet aucune seconde ligne `pending`. Les séparer ferait échouer une
   * livraison sur deux en cas de concurrence — et une livraison perdue est un
   * catalogue qui ne part jamais, sans que rien ne le dise.
   */
  abstract deliver(delivery: CatalogDelivery): Promise<void>;
}

import type { StoredDocument } from "../../../platform/storage/document-store.js";

/**
 * **La photo d'une étape de procédure, servie au livreur** (plan « Ma
 * tournée », MT-D5 v2) — l'image dont la vue ne porte que `hasPhoto` et
 * `photoRevision`.
 *
 * Séparé de {@link DeliveryProceduresReader} parce que ses consommateurs le
 * sont : la vue de la tournée lit les textes, la route de l'image est appelée
 * une fois par vignette et ne lit que des octets.
 *
 * La livraison DÉCLARE, le commerce implémente en relisant l'image par le
 * MÊME chemin que la route du staff (clé sous le mur `(société, adresse)`,
 * type MIME relu dans les octets), relié dans
 * `appBootstrap/delivery-feed.module.ts`.
 */
export abstract class DeliveryStepPhotosReader {
  /**
   * La photo de l'étape `stepId` de la procédure de l'adresse reliée à la
   * commande `orderId`, ou `null` : la commande n'a pas d'adresse reliée,
   * l'étape n'est pas dans cette procédure, ou elle n'a pas de photo.
   */
  abstract photoOf(orderId: string, stepId: string): Promise<StoredDocument | null>;
}

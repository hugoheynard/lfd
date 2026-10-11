import type { UuidGenerator } from "../../../platform/id/uuid-generator.js";
import type { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { OperationImageChangedFact } from "../../channels/b2b-platform/operations/operation-image-changed.fact.js";
import type { CatalogueImage, ImageCatalogue } from "../../channels/media/image-catalogue.js";
import type { OperationImage } from "../domain/value-objects/operation-image.js";

/** Une opération à réannoncer : sa clé, et l'image qu'elle porte AUJOURD'HUI (ou aucune). */
export interface OperationImageToAnnounce {
  readonly key: string;
  readonly image: OperationImage | null;
}

/** Ce qu'il faut pour annoncer : la médiathèque (le point), la boîte d'envoi, les gestes. */
export interface OperationImageAnnouncer {
  readonly images: ImageCatalogue;
  readonly durable: DurablePublisher;
  readonly ids: UuidGenerator;
}

/**
 * **Publie `pim.operation_image_changed` pour chaque opération donnée** — la
 * seule construction de la charge utile, partagée par les deux émetteurs
 * (`documentation/mediatheque/mediatheque.md` §7 bis) : l'abonné à la
 * médiathèque (remplacement, redescription) et l'édition de l'annonce au
 * référentiel (poser, changer, retirer l'image, changer son alternative).
 *
 * L'URL et l'alternative sont celles de l'OPÉRATION ; le point focal est
 * relu à la médiathèque, en une lecture pour toutes les URL. Une image
 * inconnue du fonds part sans point (recadrage au centre, comme au push) ;
 * une opération sans image part avec `image: null`, et le commerce efface sa
 * copie. Chaque annonce tire un geste neuf (UUID v7), qui l'ordonne.
 *
 * À appeler dans la transaction de l'émetteur : la boîte d'envoi y écrit.
 */
export async function announceOperationImages(
  announcer: OperationImageAnnouncer,
  operations: readonly OperationImageToAnnounce[],
): Promise<void> {
  const urls = [...new Set(operations.flatMap(({ image }) => (image === null ? [] : [image.url])))];
  const described: ReadonlyMap<string, CatalogueImage> =
    urls.length === 0 ? new Map() : await announcer.images.describe(urls);
  for (const { key, image } of operations) {
    const wire =
      image === null ? null : { ...image, focal: described.get(image.url)?.focal ?? null };
    const fact = new OperationImageChangedFact(key, announcer.ids.next(), wire);
    await announcer.durable.publish(fact.durableFact());
  }
}

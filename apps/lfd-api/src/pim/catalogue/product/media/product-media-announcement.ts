import type { SyncMedia } from "@lfd/catalog-sync";

import { SOURCE_LOCALE } from "../../shared/domain/value-objects/localized-text.js";

import type { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import type { UuidGenerator } from "../../../../platform/id/uuid-generator.js";
import { ProductMediaChangedFact } from "../../../channels/b2b-platform/products/product-media-changed.fact.js";
import type { EditorialReader, ProductMediaRecord } from "../domain/ports/editorial-reader.js";

/**
 * Le rôle que la vitrine montre en ouverture, et celui qu'elle montre en rayon.
 *
 * ⚠️ Les mêmes que `channels/b2b-platform/products/showcase.ts`, et c'est une
 * duplication qu'il faut voir : deux endroits décident ce qui traverse, l'un
 * pour le push, l'autre pour la projection. **Ils doivent dire la même chose**,
 * sinon un push et une projection écriraient deux visuels différents sur la
 * même fiche — et seul un aller-retour entre les deux le dirait.
 */
export const MAIN_ROLE = "hero";
export const THUMBNAIL_ROLE = "thumbnail";

/** Les rôles qui traversent vers la vitrine — les seuls qu'une annonce décrit. */
export const SHOWCASED_ROLES: readonly string[] = [MAIN_ROLE, THUMBNAIL_ROLE];

/** Ce qu'une annonce consomme : la lecture des visuels, la boîte d'envoi, les gestes. */
export interface ProductMediaAnnouncer {
  readonly readers: EditorialReader;
  readonly durable: DurablePublisher;
  readonly ids: UuidGenerator;
}

/**
 * **Annonce les visuels d'une fiche** au catalogue marchand, par un fait
 * durable écrit dans la transaction ambiante.
 *
 * Partagée par deux cas, et c'est la raison de ce fichier : l'enregistrement
 * de la section des visuels (`set-product-media.ts`), et l'abonné qui
 * republie quand la médiathèque redécrit une image portée
 * (`on-media-asset-described.ts`, L4). Deux compositions finiraient par
 * diverger sur le détail qui compte — l'alternative aplatie, le point focal.
 *
 * Relue plutôt qu'assemblée : la fiche ne porte que le rôle et l'URL ;
 * l'alternative, les dimensions et le point focal vivent à la médiathèque.
 * Chaque annonce tire son propre geste (UUID v7) : la projection n'écrit que
 * si le geste est plus récent que celui déjà posé.
 */
export async function announceProductMedia(
  announcer: ProductMediaAnnouncer,
  productId: string,
): Promise<void> {
  const media = await announcer.readers.mediaOf(productId);
  const fact = new ProductMediaChangedFact(
    productId,
    announcer.ids.next(),
    syncMediaOf(media, MAIN_ROLE),
    syncMediaOf(media, THUMBNAIL_ROLE),
  );
  await announcer.durable.publish(fact.durableFact());
}

/**
 * Le visuel d'un rôle, à la forme du fil — ou `null`.
 *
 * L'alternative est aplatie en langue SOURCE, comme sur le fil : une vitrine
 * publique ne négocie pas la langue, et le récepteur n'a pas de carte de
 * locales à lire.
 */
function syncMediaOf(media: readonly ProductMediaRecord[], role: string): SyncMedia | null {
  const found = media.find((item) => item.role === role);
  return found === undefined
    ? null
    : {
        url: found.url,
        alt: found.alt[SOURCE_LOCALE] ?? "",
        width: found.width,
        height: found.height,
        focal: found.focal,
      };
}

import type { StoredSiteView } from "@lfd/contracts";

/**
 * **Le port de lecture des sites** — l'écran des réglages et la livraison.
 *
 * Il rend les sites ARCHIVÉS aussi, marqués : l'écran les montre à part, et
 * un archivé se résout par id (départ, copies). Ce n'est donc pas la liste
 * que voit le client — celle-là ne garde que les sites actifs qui remettent
 * (`PickupAddressRepository.list`).
 */
export abstract class SiteReader {
  /** Tous les sites : le défaut en tête, les archivés à la fin. */
  abstract list(): Promise<readonly StoredSiteView[]>;

  /** Un site, archivé ou non ; `null` si l'id n'existe pas. */
  abstract get(id: string): Promise<StoredSiteView | null>;
}

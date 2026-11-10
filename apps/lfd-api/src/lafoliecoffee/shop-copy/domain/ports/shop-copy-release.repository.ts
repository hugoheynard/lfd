import type { ShopCopyStamp } from "../shop-copy-entry.js";
import type { ShopCopyRelease } from "../shop-copy-release.js";

/**
 * Port d'écriture de **« Publier »** : la version et les brouillons en attente.
 * À appeler dans une unité de travail — tout part ensemble, ou rien.
 */
export abstract class ShopCopyReleaseRepository {
  abstract load(): Promise<ShopCopyRelease>;

  /**
   * Pose la version et réécrit les textes touchés.
   *
   * @throws {ShopCopyPublishedMeanwhileError} la version a bougé depuis le chargement.
   * @throws {ShopCopyChangedError} un brouillon a été réécrit pendant la publication.
   */
  abstract save(release: ShopCopyRelease, stamp: ShopCopyStamp): Promise<void>;
}

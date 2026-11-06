import type { MailCopyStamp } from "../mail-copy-entry.js";
import type { MailCopyRelease } from "../mail-copy-release.js";

/**
 * Port d'écriture de **« Publier »** : la version et les brouillons en attente,
 * textes et ordres de sections (E4).
 * À appeler dans une unité de travail — tout part ensemble, ou rien.
 */
export abstract class MailCopyReleaseRepository {
  abstract load(): Promise<MailCopyRelease>;

  /**
   * Pose la version et réécrit les textes et les ordres touchés.
   *
   * @throws {MailCopyPublishedMeanwhileError} la version a bougé depuis le chargement.
   * @throws {MailCopyChangedError} un brouillon a été réécrit pendant la publication.
   * @throws {MailSectionOrderChangedError} un ordre a été déplacé pendant la publication.
   */
  abstract save(release: MailCopyRelease, stamp: MailCopyStamp): Promise<void>;
}

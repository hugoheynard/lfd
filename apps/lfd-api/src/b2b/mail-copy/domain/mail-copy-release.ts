import type { MailCopyChange, MailCopyEntry, MailCopyStamp } from "./mail-copy-entry.js";
import { NothingToPublishError } from "./mail-copy-errors.js";
import type { MailCopyManifest } from "./mail-copy-manifest.js";

/**
 * **Une publication des textes des e-mails** — tous les brouillons en attente,
 * et la version courante (C3 : « un seul geste les met en service »).
 */
export class MailCopyRelease {
  private published = false;

  private constructor(
    private readonly loadedVersion: number,
    private readonly pending: readonly MailCopyEntry[],
  ) {}

  /** `pending` : les textes dont le brouillon n'est pas `unchanged`. */
  static of(version: number, pending: readonly MailCopyEntry[]): MailCopyRelease {
    return new MailCopyRelease(version, pending);
  }

  /** La version lue — la condition de l'écriture. */
  get expectedVersion(): number {
    return this.loadedVersion;
  }

  /** La version posée par la publication. */
  get version(): number {
    return this.published ? this.loadedVersion + 1 : this.loadedVersion;
  }

  /** Les textes touchés, à réécrire. */
  get entries(): readonly MailCopyEntry[] {
    return this.pending;
  }

  /**
   * Publie. Rend les changements envoyés — vide si chaque brouillon rendait le
   * texte déjà publié ; la version monte quand même : les brouillons sont soldés.
   *
   * @throws {NothingToPublishError} aucun brouillon publiable n'attend.
   */
  publish(manifest: MailCopyManifest, stamp: MailCopyStamp): readonly MailCopyChange[] {
    const publishable = this.pending.filter(
      (entry) => entry.snapshot().draft.state === "reset" || entry.knownBy(manifest),
    );
    if (publishable.length === 0) {
      throw new NothingToPublishError();
    }
    this.published = true;
    return publishable.flatMap((entry) => {
      const change = entry.publish(manifest, stamp);
      return change === null ? [] : [change];
    });
  }
}

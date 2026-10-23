import type { MailCopyChange, MailCopyEntry, MailCopyStamp } from "./mail-copy-entry.js";
import { NothingToPublishError } from "./mail-copy-errors.js";
import type { MailCopyManifest } from "./mail-copy-manifest.js";
import type { MailSectionOrder, MailSectionOrderChange } from "./mail-section-order.js";

/** Ce qu'une publication change dans les e-mails : des textes, des ordres de sections. */
export interface MailCopyPublication {
  readonly texts: readonly MailCopyChange[];
  readonly sectionOrders: readonly MailSectionOrderChange[];
}

/**
 * **Une publication des textes des e-mails** — tous les brouillons en attente,
 * textes ET ordres de sections, et la version courante (C3 : « un seul geste
 * les met en service » ; E4, S3 : l'ordre se publie comme les textes).
 *
 * Une seule publication pour les deux, et c'est voulu : l'aperçu montre
 * l'e-mail entier, mots et ordre, et « Publier » met en service ce qu'il a
 * montré — un ordre publié sans les textes qu'on a relus avec lui ferait
 * partir un e-mail que personne n'a vu.
 */
export class MailCopyRelease {
  private published = false;

  private constructor(
    private readonly loadedVersion: number,
    private readonly pending: readonly MailCopyEntry[],
    private readonly pendingOrders: readonly MailSectionOrder[],
  ) {}

  /** `pending`, `pendingOrders` : les brouillons qui ne sont pas `unchanged`. */
  static of(
    version: number,
    pending: readonly MailCopyEntry[],
    pendingOrders: readonly MailSectionOrder[] = [],
  ): MailCopyRelease {
    return new MailCopyRelease(version, pending, pendingOrders);
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

  /** Les ordres touchés, à réécrire. */
  get sectionOrders(): readonly MailSectionOrder[] {
    return this.pendingOrders;
  }

  /**
   * Publie. Rend les changements envoyés — vides si chaque brouillon rendait
   * ce qui était déjà publié ; la version monte quand même : les brouillons
   * sont soldés.
   *
   * @throws {NothingToPublishError} aucun brouillon publiable n'attend.
   */
  publish(manifest: MailCopyManifest, stamp: MailCopyStamp): MailCopyPublication {
    const texts = this.pending.filter(
      (entry) => entry.snapshot().draft.state === "reset" || entry.knownBy(manifest),
    );
    const orders = this.pendingOrders.filter((order) => order.publishable(manifest));
    if (texts.length + orders.length === 0) {
      throw new NothingToPublishError();
    }
    this.published = true;
    return {
      texts: texts.flatMap((entry) => {
        const change = entry.publish(manifest, stamp);
        return change === null ? [] : [change];
      }),
      sectionOrders: orders.flatMap((order) => {
        const change = order.publish(manifest, stamp);
        return change === null ? [] : [change];
      }),
    };
  }
}

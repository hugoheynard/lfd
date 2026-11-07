import type { MailCopyChange, MailCopyEntry, MailCopyStamp } from "./mail-copy-entry.js";
import { NothingToPublishError } from "./mail-copy-errors.js";
import type { MailCopyManifest } from "./mail-copy-manifest.js";
import type { MailSectionOrder, MailSectionOrderChange } from "./mail-section-order.js";

/** Ce qu'une publication change dans les e-mails : des textes, des ordres de sections. */
export interface MailCopyPublication {
  readonly texts: readonly MailCopyChange[];
  readonly sectionOrders: readonly MailSectionOrderChange[];
}

/** Ce qu'une publication emporte en plus des textes. */
export interface MailCopyPublishOptions {
  /** Le document d'un e-mail se publie avec (S4c) : la publication a lieu sans phrase. */
  readonly withDocument?: boolean;
  /** Les ordres de sections en brouillon partent aussi — vrai par défaut. */
  readonly withSectionOrders?: boolean;
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
  /** Faux quand seule la version monte, pour un document d'e-mail (S4c). */
  private phrasesPublished = false;
  /** Faux quand la publication laisse les ordres de sections (éditeur par blocs, § 21). */
  private ordersPublished = false;

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

  /** Les textes touchés, à réécrire — aucun si les phrases n'ont pas été publiées. */
  get entries(): readonly MailCopyEntry[] {
    return this.phrasesPublished ? this.pending : [];
  }

  /** Les ordres touchés, à réécrire — aucun si les phrases n'ont pas été publiées. */
  get sectionOrders(): readonly MailSectionOrder[] {
    return this.ordersPublished ? this.pendingOrders : [];
  }

  /**
   * Vrai si un texte ou un ordre de sections publiable attend. Sans
   * `withSectionOrders`, un ordre en attente ne compte pas : l'éditeur par
   * blocs ne le publie plus (plan `plan-editeur-par-blocs.md`, § 21).
   */
  hasPublishable(manifest: MailCopyManifest, withSectionOrders = true): boolean {
    return (
      this.pending.some(
        (entry) => entry.snapshot().draft.state === "reset" || entry.knownBy(manifest),
      ) ||
      (withSectionOrders && this.pendingOrders.some((order) => order.publishable(manifest)))
    );
  }

  /**
   * Fait monter la version sans publier de phrase : le document d'un e-mail a
   * été retiré (plan `plan-editeur-par-blocs.md`, S4c). La version est
   * l'estampille du cache du publié — sans elle, les autres instances
   * enverraient encore le document retiré.
   */
  markDocumentChange(): void {
    this.published = true;
  }

  /**
   * Publie. Rend les changements envoyés — vides si chaque brouillon rendait
   * ce qui était déjà publié ; la version monte quand même : les brouillons
   * sont soldés.
   *
   * `withDocument` (S4c) : le document d'un e-mail se publie dans la même
   * publication — elle a donc lieu même sans phrase en attente.
   *
   * `withSectionOrders` (vrai par défaut) : faux sous l'éditeur par blocs, où
   * le document fait foi pour l'ordre (§ 21, tranché le 2026-11-07) — les
   * ordres en brouillon restent en brouillon, ni publiés ni effacés.
   *
   * @throws {NothingToPublishError} aucun brouillon publiable n'attend.
   */
  publish(
    manifest: MailCopyManifest,
    stamp: MailCopyStamp,
    options: MailCopyPublishOptions = {},
  ): MailCopyPublication {
    const withSectionOrders = options.withSectionOrders ?? true;
    const texts = this.pending.filter(
      (entry) => entry.snapshot().draft.state === "reset" || entry.knownBy(manifest),
    );
    const orders = withSectionOrders
      ? this.pendingOrders.filter((order) => order.publishable(manifest))
      : [];
    if (texts.length + orders.length === 0 && options.withDocument !== true) {
      throw new NothingToPublishError();
    }
    this.published = true;
    this.phrasesPublished = true;
    this.ordersPublished = withSectionOrders;
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

import { validReplacement } from "./replacement-text.js";
import { ShopCopyChangedError, UnknownShopCopyKeyError } from "./shop-copy-errors.js";
import type { ShopCopyLocale } from "./shop-copy-locale.js";
import type { ShopCopyManifest } from "./shop-copy-manifest.js";

/** Les trois états du brouillon (§10) : rien, un remplacement, le retour à l'original. */
export type ShopCopyDraft =
  | { readonly state: "unchanged" }
  | { readonly state: "set"; readonly text: string }
  | { readonly state: "reset" };

/** Qui a fait un geste, et quand. */
export interface ShopCopyStamp {
  readonly at: Date;
  readonly staffId: string;
}

/** Un texte qui change à la publication : la valeur servie avant, et après. */
export interface ShopCopyChange {
  readonly key: string;
  readonly locale: ShopCopyLocale;
  readonly before: string | null;
  readonly after: string | null;
}

/** L'état complet d'un texte, tel qu'il se persiste. */
export interface ShopCopyEntryState {
  readonly key: string;
  readonly locale: ShopCopyLocale;
  /** 0 = jamais écrit (aucune ligne). */
  readonly revision: number;
  readonly draft: ShopCopyDraft;
  readonly drafted: ShopCopyStamp | null;
  readonly publishedText: string | null;
  readonly published: ShopCopyStamp | null;
}

const UNCHANGED: ShopCopyDraft = { state: "unchanged" };

/**
 * **Un texte de la boutique dans une langue** — l'agrégat du brouillon.
 *
 * Il refuse : un texte d'une clé que le manifeste ne connaît pas, un
 * remplacement qui viole un garde-fou, et toute écriture faite sur une
 * révision que quelqu'un a dépassée. La révision monte à chaque geste de
 * brouillon — pas à la publication, qui n'est pas une écriture d'un rédacteur.
 */
export class ShopCopyEntry {
  private constructor(private state: ShopCopyEntryState) {}

  /** Un texte que personne n'a encore touché : le texte du code, révision 0. */
  static untouched(key: string, locale: ShopCopyLocale): ShopCopyEntry {
    return new ShopCopyEntry({
      key,
      locale,
      revision: 0,
      draft: UNCHANGED,
      drafted: null,
      publishedText: null,
      published: null,
    });
  }

  static reconstitute(state: ShopCopyEntryState): ShopCopyEntry {
    return new ShopCopyEntry(state);
  }

  get key(): string {
    return this.state.key;
  }

  get locale(): ShopCopyLocale {
    return this.state.locale;
  }

  get revision(): number {
    return this.state.revision;
  }

  /** Attend-il « Publier » ? */
  get pending(): boolean {
    return this.state.draft.state !== "unchanged";
  }

  snapshot(): ShopCopyEntryState {
    return this.state;
  }

  /**
   * Écrit un remplacement en brouillon.
   *
   * @throws {ShopCopyChangedError} la révision lue n'est plus la courante.
   * @throws {UnknownShopCopyKeyError} la clé n'est pas dans le manifeste.
   * @throws {InvalidShopCopyTextError} un garde-fou refuse le texte.
   */
  draft(
    text: string,
    manifest: ShopCopyManifest,
    expectedRevision: number,
    stamp: ShopCopyStamp,
  ): void {
    this.assertRevision(expectedRevision);
    const entry = manifest.entry(this.state.key);
    if (entry === null) {
      throw new UnknownShopCopyKeyError(this.state.key);
    }
    const valid = validReplacement(entry, this.state.locale, text);
    this.touch({ state: "set", text: valid }, stamp);
  }

  /**
   * Revenir au texte du code, au prochain « Publier ». Sans rien de publié, il
   * n'y a rien à défaire : le brouillon est simplement abandonné. Permis sur
   * une orpheline — c'est ainsi qu'on efface un remplacement que le code a
   * perdu.
   *
   * @throws {ShopCopyChangedError} la révision lue n'est plus la courante.
   */
  reset(expectedRevision: number, stamp: ShopCopyStamp): void {
    this.assertRevision(expectedRevision);
    this.touch(this.state.publishedText === null ? UNCHANGED : { state: "reset" }, stamp);
  }

  /**
   * Applique le brouillon au publié. Rend le changement servi, ou `null` si
   * rien ne change à l'écran (brouillon égal au publié, orpheline en `set`).
   *
   * 🔴 Une orpheline en `set` n'est JAMAIS publiée : sa clé n'existe plus dans
   * le code, l'appliquer n'aurait aucun effet visible et ferait croire le
   * contraire. Son brouillon reste, et l'éditeur la montre.
   */
  publish(manifest: ShopCopyManifest, stamp: ShopCopyStamp): ShopCopyChange | null {
    const { draft, publishedText } = this.state;
    if (draft.state === "unchanged" || (draft.state === "set" && !manifest.knows(this.key))) {
      return null;
    }
    const after = draft.state === "set" ? draft.text : null;
    this.state = { ...this.state, draft: UNCHANGED, publishedText: after, published: stamp };
    return after === publishedText
      ? null
      : { key: this.key, locale: this.locale, before: publishedText, after };
  }

  private touch(draft: ShopCopyDraft, stamp: ShopCopyStamp): void {
    this.state = { ...this.state, draft, drafted: stamp, revision: this.state.revision + 1 };
  }

  private assertRevision(expected: number): void {
    if (expected !== this.state.revision) {
      throw new ShopCopyChangedError(this.state.key, this.state.locale);
    }
  }
}

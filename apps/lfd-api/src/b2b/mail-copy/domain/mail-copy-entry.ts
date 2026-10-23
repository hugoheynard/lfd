import { MailCopyChangedError, UnknownMailTextError } from "./mail-copy-errors.js";
import type { MailCopyLocale } from "./mail-copy-locale.js";
import type { MailCopyManifest } from "./mail-copy-manifest.js";
import { validMailText } from "./mail-text.js";

/** Les trois états du brouillon : rien, un remplacement, le retour au texte du code. */
export type MailCopyDraft =
  | { readonly state: "unchanged" }
  | { readonly state: "set"; readonly text: string }
  | { readonly state: "reset" };

/** Qui a fait un geste, et quand. */
export interface MailCopyStamp {
  readonly at: Date;
  readonly staffId: string;
}

/** Un texte qui change à la publication : la valeur envoyée avant, et après. */
export interface MailCopyChange {
  readonly mail: string;
  readonly path: string;
  readonly locale: MailCopyLocale;
  readonly before: string | null;
  readonly after: string | null;
}

/** L'état complet d'un texte, tel qu'il se persiste. */
export interface MailCopyEntryState {
  readonly mail: string;
  readonly path: string;
  readonly locale: MailCopyLocale;
  /** 0 = jamais écrit (aucune ligne). */
  readonly revision: number;
  readonly draft: MailCopyDraft;
  readonly drafted: MailCopyStamp | null;
  readonly publishedText: string | null;
  readonly published: MailCopyStamp | null;
}

const UNCHANGED: MailCopyDraft = { state: "unchanged" };

/**
 * **Un texte d'un e-mail dans une langue** — l'agrégat du brouillon (plan
 * `plan-textes-des-e-mails.md`, C2, C3, C5), sur le modèle de `ShopCopyEntry`.
 *
 * Il refuse : un texte que le dictionnaire ne connaît pas, un texte qui perd
 * ou invente une variable, et toute écriture faite sur une révision que
 * quelqu'un a dépassée. La révision monte à chaque geste de brouillon.
 */
export class MailCopyEntry {
  private constructor(private state: MailCopyEntryState) {}

  /** Un texte que personne n'a encore touché : le texte du code, révision 0. */
  static untouched(mail: string, path: string, locale: MailCopyLocale): MailCopyEntry {
    return new MailCopyEntry({
      mail,
      path,
      locale,
      revision: 0,
      draft: UNCHANGED,
      drafted: null,
      publishedText: null,
      published: null,
    });
  }

  static reconstitute(state: MailCopyEntryState): MailCopyEntry {
    return new MailCopyEntry(state);
  }

  get mail(): string {
    return this.state.mail;
  }

  get path(): string {
    return this.state.path;
  }

  get locale(): MailCopyLocale {
    return this.state.locale;
  }

  snapshot(): MailCopyEntryState {
    return this.state;
  }

  /**
   * Écrit un texte en brouillon.
   *
   * @throws {MailCopyChangedError} la révision lue n'est plus la courante.
   * @throws {UnknownMailTextError} le texte n'est pas au dictionnaire.
   * @throws {InvalidMailTextError} le texte est vide, perd ou invente une variable.
   */
  draft(
    text: string,
    manifest: MailCopyManifest,
    expectedRevision: number,
    stamp: MailCopyStamp,
  ): void {
    this.assertRevision(expectedRevision);
    const entry = manifest.entry(this.state.mail, this.state.path);
    if (entry === null) {
      throw new UnknownMailTextError(this.state.mail, this.state.path);
    }
    this.touch({ state: "set", text: validMailText(entry, text) }, stamp);
  }

  /**
   * Rétablir le texte du code, au prochain « Publier ». Sans rien de publié,
   * il n'y a rien à défaire : le brouillon est simplement abandonné. Permis sur
   * une orpheline — c'est ainsi qu'on efface un texte que le code a perdu.
   *
   * @throws {MailCopyChangedError} la révision lue n'est plus la courante.
   */
  reset(expectedRevision: number, stamp: MailCopyStamp): void {
    this.assertRevision(expectedRevision);
    this.touch(this.state.publishedText === null ? UNCHANGED : { state: "reset" }, stamp);
  }

  /**
   * Applique le brouillon au publié. Rend le changement envoyé, ou `null` si
   * rien ne change dans les e-mails (brouillon égal au publié, orpheline).
   *
   * 🔴 Une orpheline en `set` n'est JAMAIS publiée : son texte n'existe plus
   * dans le code, l'appliquer ne changerait aucun e-mail. Son brouillon reste.
   */
  publish(manifest: MailCopyManifest, stamp: MailCopyStamp): MailCopyChange | null {
    const { draft, publishedText } = this.state;
    if (draft.state === "unchanged" || (draft.state === "set" && !this.knownBy(manifest))) {
      return null;
    }
    const after = draft.state === "set" ? draft.text : null;
    this.state = { ...this.state, draft: UNCHANGED, publishedText: after, published: stamp };
    return after === publishedText
      ? null
      : { mail: this.mail, path: this.path, locale: this.locale, before: publishedText, after };
  }

  /** Le dictionnaire de ce code connaît-il encore ce texte ? */
  knownBy(manifest: MailCopyManifest): boolean {
    return manifest.knows(this.state.mail, this.state.path);
  }

  private touch(draft: MailCopyDraft, stamp: MailCopyStamp): void {
    this.state = { ...this.state, draft, drafted: stamp, revision: this.state.revision + 1 };
  }

  private assertRevision(expected: number): void {
    if (expected !== this.state.revision) {
      throw new MailCopyChangedError(this.state.mail, this.state.path, this.state.locale);
    }
  }
}

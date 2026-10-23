import type { MailCopyStamp } from "./mail-copy-entry.js";
import { MailSectionOrderChangedError, UnknownMailError } from "./mail-copy-errors.js";
import type { MailCopyManifest } from "./mail-copy-manifest.js";
import { keepsSections, validSectionOrder } from "./mail-section-order-rule.js";

/** Les trois états du brouillon d'un ordre — ceux d'un texte (C3). */
export type MailSectionOrderDraft =
  | { readonly state: "unchanged" }
  | { readonly state: "set"; readonly order: readonly string[] }
  | { readonly state: "reset" };

/** Un ordre qui change à la publication. `null` : l'ordre du code. */
export interface MailSectionOrderChange {
  readonly mail: string;
  readonly before: readonly string[] | null;
  readonly after: readonly string[] | null;
}

/** L'état complet de l'ordre d'un e-mail, tel qu'il se persiste. */
export interface MailSectionOrderState {
  readonly mail: string;
  /** 0 = jamais écrit (aucune ligne). */
  readonly revision: number;
  readonly draft: MailSectionOrderDraft;
  readonly drafted: MailCopyStamp | null;
  readonly publishedOrder: readonly string[] | null;
  readonly published: MailCopyStamp | null;
}

const UNCHANGED: MailSectionOrderDraft = { state: "unchanged" };

/**
 * **L'ordre des sections d'un e-mail** — l'agrégat de son brouillon (plan
 * `plan-textes-des-e-mails.md`, E4, S2 et S3), sur le modèle exact d'un texte
 * (`MailCopyEntry`) : brouillon, puis publié par le même « Publier ».
 *
 * Il refuse : un e-mail sans sections déclarées, un ordre qui oublie, double
 * ou invente une section ou qui nomme un cadre, et toute écriture faite sur
 * une révision que quelqu'un a dépassée.
 */
export class MailSectionOrder {
  private constructor(private state: MailSectionOrderState) {}

  /** Un ordre que personne n'a touché : celui du code, révision 0. */
  static untouched(mail: string): MailSectionOrder {
    return new MailSectionOrder({
      mail,
      revision: 0,
      draft: UNCHANGED,
      drafted: null,
      publishedOrder: null,
      published: null,
    });
  }

  static reconstitute(state: MailSectionOrderState): MailSectionOrder {
    return new MailSectionOrder(state);
  }

  get mail(): string {
    return this.state.mail;
  }

  snapshot(): MailSectionOrderState {
    return this.state;
  }

  /**
   * Pose un ordre en brouillon.
   *
   * @throws {MailSectionOrderChangedError} la révision lue n'est plus la courante.
   * @throws {UnknownMailError} l'e-mail ne déclare pas de sections.
   * @throws {InvalidMailSectionOrderError} une section oubliée, doublée, inconnue, ou un cadre.
   */
  draft(
    order: readonly string[],
    manifest: MailCopyManifest,
    expectedRevision: number,
    stamp: MailCopyStamp,
  ): void {
    this.assertRevision(expectedRevision);
    const layout = manifest.layoutOf(this.state.mail);
    if (layout === null) {
      throw new UnknownMailError(this.state.mail);
    }
    this.touch({ state: "set", order: [...validSectionOrder(layout, order)] }, stamp);
  }

  /**
   * Rétablir l'ordre du code, au prochain « Publier ». Sans ordre publié, le
   * brouillon est simplement abandonné.
   *
   * @throws {MailSectionOrderChangedError} la révision lue n'est plus la courante.
   */
  reset(expectedRevision: number, stamp: MailCopyStamp): void {
    this.assertRevision(expectedRevision);
    this.touch(this.state.publishedOrder === null ? UNCHANGED : { state: "reset" }, stamp);
  }

  /**
   * Applique le brouillon au publié. Rend le changement, ou `null` si rien ne
   * change. Un brouillon que les sections du code ne permettent plus (une
   * section retirée depuis) n'est JAMAIS publié : il reste en brouillon.
   */
  publish(manifest: MailCopyManifest, stamp: MailCopyStamp): MailSectionOrderChange | null {
    const { draft, publishedOrder } = this.state;
    if (draft.state === "unchanged" || (draft.state === "set" && !this.knownBy(manifest))) {
      return null;
    }
    const after = draft.state === "set" ? draft.order : null;
    this.state = { ...this.state, draft: UNCHANGED, publishedOrder: after, published: stamp };
    return sameOrder(after, publishedOrder)
      ? null
      : { mail: this.state.mail, before: publishedOrder, after };
  }

  /** Le brouillon est-il publiable : un `reset`, ou un ordre qui tient encore ? */
  publishable(manifest: MailCopyManifest): boolean {
    return this.state.draft.state === "reset" || this.knownBy(manifest);
  }

  private knownBy(manifest: MailCopyManifest): boolean {
    const layout = manifest.layoutOf(this.state.mail);
    const { draft } = this.state;
    return layout !== null && draft.state === "set" && keepsSections(layout, draft.order);
  }

  private touch(draft: MailSectionOrderDraft, stamp: MailCopyStamp): void {
    this.state = { ...this.state, draft, drafted: stamp, revision: this.state.revision + 1 };
  }

  private assertRevision(expected: number): void {
    if (expected !== this.state.revision) {
      throw new MailSectionOrderChangedError(this.state.mail);
    }
  }
}

function sameOrder(left: readonly string[] | null, right: readonly string[] | null): boolean {
  return left === null || right === null
    ? left === right
    : left.length === right.length && left.every((id, index) => right[index] === id);
}

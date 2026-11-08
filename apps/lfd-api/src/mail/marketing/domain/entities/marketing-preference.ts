import type { MailBrandCode } from "../../../requests/domain/value-objects/mail-brand.js";
import {
  MarketingConfirmationAfterUnsubscribeError,
  MarketingResubscriptionRefusedError,
} from "../errors/marketing-preference.errors.js";
import type { MarketingAddress } from "../value-objects/marketing-address.js";
import type {
  ConsentDraft,
  MarketingErasure,
  MarketingPreferenceSnapshot,
  UnsubscribeAct,
} from "./marketing-preference-state.js";
import { validSnapshot } from "./marketing-preference-validation.js";

export type {
  ConsentDraft,
  ConsentProof,
  MarketingErasure,
  MarketingPreferenceSnapshot,
  UnsubscribeAct,
} from "./marketing-preference-state.js";

/** Le lieu du seul geste qui lève une désinscription : « Mes préférences », connecté. */
const RESUBSCRIBE_PLACE = "preferences";

/**
 * **La préférence marketing d'une adresse pour un espace** — l'agrégat du
 * registre (plan `documentation/mail/plan-desinscription-des-e-mails.md`,
 * règles 10, 18, 20, 22, 23).
 *
 * Il porte les règles qui peuvent refuser une écriture :
 *
 * - `pending → accepted` à la confirmation ; une adresse désinscrite entre
 *   la demande et le clic ne repasse pas `accepted` ;
 * - toute ligne peut passer `unsubscribed` — et une désinscription garde son
 *   premier instant et sa première source (idempotente) ;
 * - `unsubscribed → accepted` seulement par le geste volontaire de
 *   « Mes préférences » (C3) ;
 * - l'effacement supprime un accord, et ne laisse d'une désinscription que
 *   son empreinte.
 */
export class MarketingPreference {
  private constructor(private state: MarketingPreferenceSnapshot) {}

  /**
   * Une désinscription d'une adresse que le registre ne connaissait pas : elle
   * éteint la question pour toujours (décisions de Hugo).
   */
  static optedOut(
    id: string,
    space: MailBrandCode,
    address: MarketingAddress,
    act: UnsubscribeAct,
  ): MarketingPreference {
    return new MarketingPreference({
      ...blank(id, space, address),
      status: "unsubscribed",
      unsubscribedAt: act.at,
      unsubscribedSource: act.source,
    });
  }

  /** Un accord sur une adresse NON vérifiée : `pending`, en attente du clic (règle 18). */
  static requested(
    id: string,
    space: MailBrandCode,
    address: MarketingAddress,
    draft: ConsentDraft,
  ): MarketingPreference {
    return new MarketingPreference({
      ...blank(id, space, address),
      status: "pending",
      origin: draft.origin,
      proof: draft.proof,
      requestedAt: draft.at,
    });
  }

  /** Un accord sur une adresse vérifiée (compte confirmé) : `accepted` d'emblée (règle 18). */
  static accepted(
    id: string,
    space: MailBrandCode,
    address: MarketingAddress,
    draft: ConsentDraft,
  ): MarketingPreference {
    return new MarketingPreference({
      ...blank(id, space, address),
      status: "accepted",
      origin: draft.origin,
      proof: draft.proof,
      requestedAt: draft.at,
      confirmedAt: draft.at,
    });
  }

  /** Relit une ligne rangée ; sa cohérence se revérifie. */
  static rehydrate(snapshot: MarketingPreferenceSnapshot): MarketingPreference {
    return new MarketingPreference(validSnapshot(snapshot));
  }

  get id(): string {
    return this.state.id;
  }

  get space(): MailBrandCode {
    return this.state.space;
  }

  /** Vrai seulement pour un accord confirmé (règle 11). */
  allowsMarketing(): boolean {
    return this.state.status === "accepted";
  }

  isUnsubscribed(): boolean {
    return this.state.status === "unsubscribed";
  }

  /** Un accord recueilli, en attente de son clic (règle 18). */
  isPending(): boolean {
    return this.state.status === "pending";
  }

  /**
   * Le clic du lien de confirmation de CETTE demande (règle 18 : « une seule
   * fois ») : le lien porte l'instant de la demande qui l'a émis, et ne
   * confirme que la ligne `pending` de cette demande-là. Un lien rejoué
   * après la confirmation, un lien d'une demande remplacée, un lien d'une
   * adresse désinscrite depuis : rien ne change.
   *
   * @returns vrai si la ligne a changé (à ranger).
   */
  confirmIssued(issuedAt: Date, at: Date): boolean {
    const { status, requestedAt } = this.state;
    if (status !== "pending" || requestedAt?.getTime() !== issuedAt.getTime()) {
      return false;
    }
    this.confirm(at);
    return true;
  }

  /** L'instant de la demande d'accord ; `null` sans accord recueilli. */
  get requestedAt(): Date | null {
    return this.state.requestedAt;
  }

  /**
   * Le clic du lien de confirmation (règle 18). Un accord déjà confirmé ne
   * change pas.
   *
   * @throws {MarketingConfirmationAfterUnsubscribeError} l'adresse s'est désinscrite entre-temps.
   */
  confirm(at: Date): void {
    if (this.state.status === "unsubscribed") {
      throw new MarketingConfirmationAfterUnsubscribeError(this.state.space);
    }
    if (this.state.status === "pending") {
      // Une réinscription confirmée efface la désinscription qu'elle lève.
      this.state = {
        ...this.state,
        status: "accepted",
        confirmedAt: at,
        unsubscribedAt: null,
        unsubscribedSource: null,
      };
    }
  }

  /**
   * Une réinscription en attente de son clic (C3) : `pending`, mais la
   * désinscription qu'elle lèvera est encore là. Seul le lien la confirme —
   * jamais une case (règle 17) —, et si personne ne clique, la purge la rend
   * à sa désinscription au lieu de la supprimer.
   */
  awaitsResubscription(): boolean {
    return this.state.status === "pending" && this.state.unsubscribedAt !== null;
  }

  /** Ce que la désinscription a retenu ; `null` sur une ligne qui n'en porte pas. */
  get unsubscribeAct(): UnsubscribeAct | null {
    const { unsubscribedAt, unsubscribedSource } = this.state;
    return unsubscribedAt === null || unsubscribedSource === null
      ? null
      : { at: unsubscribedAt, source: unsubscribedSource };
  }

  /** L'empreinte de l'adresse de cette ligne. */
  get print(): string {
    return this.state.print;
  }

  /**
   * **L'état suit l'adresse** (règle 24) : la ligne passe à la nouvelle
   * adresse d'un compte, état, preuve et origine compris. Une désinscription
   * reste une désinscription, un accord reste accordé.
   */
  relocate(address: MarketingAddress): void {
    this.state = { ...this.state, recipientKey: address.key, print: address.print };
  }

  /**
   * Le retrait de l'accord, quelle que soit son origine (règle 20).
   * Idempotent : une ligne déjà désinscrite garde son premier instant.
   *
   * @returns vrai si la ligne a changé.
   */
  unsubscribe(act: UnsubscribeAct): boolean {
    if (this.state.status === "unsubscribed") {
      return false;
    }
    this.state = {
      ...this.state,
      status: "unsubscribed",
      unsubscribedAt: act.at,
      unsubscribedSource: act.source,
    };
    return true;
  }

  /**
   * La réinscription volontaire d'une adresse désinscrite (C3) : seulement
   * depuis « Mes préférences », connecté. Une adresse vérifiée passe
   * `accepted` d'emblée ; une adresse de compte NON vérifiée passe `pending`
   * et garde sa désinscription jusqu'au clic (règle 18,
   * {@link awaitsResubscription}).
   *
   * @throws {MarketingResubscriptionRefusedError} le geste ne vient pas de « Mes préférences ».
   */
  resubscribe(draft: ConsentDraft, verified: boolean): void {
    if (draft.proof.place !== RESUBSCRIBE_PLACE) {
      throw new MarketingResubscriptionRefusedError(this.state.space, draft.proof.place);
    }
    const proof = { origin: draft.origin, proof: draft.proof, requestedAt: draft.at };
    this.state = verified
      ? {
          ...this.state,
          ...proof,
          status: "accepted",
          confirmedAt: draft.at,
          unsubscribedAt: null,
          unsubscribedSource: null,
        }
      : { ...this.state, ...proof, status: "pending", confirmedAt: null };
  }

  /**
   * L'effacement d'une personne (règle 23). Une désinscription perd sa clé en
   * clair et garde son empreinte : la supprimer reviendrait à réécrire à
   * quelqu'un qui a dit non. Un accord, lui, part entièrement.
   */
  erase(): MarketingErasure {
    if (this.state.status !== "unsubscribed") {
      return "forget";
    }
    this.state = { ...this.state, recipientKey: null };
    return "print-kept";
  }

  snapshot(): MarketingPreferenceSnapshot {
    return this.state;
  }
}

function blank(
  id: string,
  space: MailBrandCode,
  address: MarketingAddress,
): Omit<MarketingPreferenceSnapshot, "status"> {
  return {
    id,
    space,
    recipientKey: address.key,
    print: address.print,
    origin: null,
    proof: null,
    requestedAt: null,
    confirmedAt: null,
    unsubscribedAt: null,
    unsubscribedSource: null,
  };
}

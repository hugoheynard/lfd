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
      this.state = { ...this.state, status: "accepted", confirmedAt: at };
    }
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
   * depuis « Mes préférences », connecté — une adresse vérifiée, donc
   * `accepted` d'emblée.
   *
   * @throws {MarketingResubscriptionRefusedError} le geste ne vient pas de « Mes préférences ».
   */
  resubscribe(draft: ConsentDraft): void {
    if (draft.proof.place !== RESUBSCRIBE_PLACE) {
      throw new MarketingResubscriptionRefusedError(this.state.space, draft.proof.place);
    }
    this.state = {
      ...this.state,
      status: "accepted",
      origin: draft.origin,
      proof: draft.proof,
      requestedAt: draft.at,
      confirmedAt: draft.at,
      unsubscribedAt: null,
      unsubscribedSource: null,
    };
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

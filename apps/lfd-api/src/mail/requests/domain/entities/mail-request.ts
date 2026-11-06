import {
  InvalidMailRequestError,
  MailRequestAlreadySettledError,
} from "../errors/mail-request.errors.js";
import { MailBrand, type MailBrandCode } from "../value-objects/mail-brand.js";

/**
 * Les états d'une demande (plan `plan-service-e-mails.md`, C7) :
 *
 * - `requested` — écrite, pas encore partie ;
 * - `sent` — acceptée par le fournisseur (pas « arrivée » : `CLAUDE.md` § 0) ;
 * - `failed` — l'envoi a échoué pour une raison technique ; un nouvel essai
 *   peut réussir ;
 * - `refused` — refusée pour une raison que réessayer ne changera pas.
 *
 * `sent` et `refused` sont terminaux.
 */
export const MAIL_REQUEST_STATUSES = ["requested", "sent", "failed", "refused"] as const;

export type MailRequestStatus = (typeof MAIL_REQUEST_STATUSES)[number];

const TEMPLATE_MAX = 80;
const RECIPIENT_MAX = 320;
const KEY_MAX = 200;
const REASON_MAX = 500;

/** Ce qu'il faut pour demander un e-mail. */
export interface MailRequestDraft {
  readonly id: string;
  readonly template: string;
  readonly brand: string;
  readonly recipient: string;
  readonly locale: string | null;
  readonly idempotencyKey: string;
  readonly requestedAt: Date;
}

/** L'état complet, tel que l'adaptateur le range et le relit. */
export interface MailRequestSnapshot {
  readonly id: string;
  readonly template: string;
  readonly brand: MailBrandCode;
  readonly recipient: string;
  readonly locale: string | null;
  readonly idempotencyKey: string;
  readonly status: MailRequestStatus;
  readonly providerId: string | null;
  readonly failureReason: string | null;
  readonly requestedAt: Date;
  readonly sentAt: Date | null;
  readonly failedAt: Date | null;
}

function required(field: string, value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvalidMailRequestError(field, "est vide");
  }
  if (trimmed.length > max) {
    throw new InvalidMailRequestError(field, `dépasse ${max} caractères`);
  }
  return trimmed;
}

function clipped(reason: string): string {
  return reason.length > REASON_MAX ? reason.slice(0, REASON_MAX) : reason;
}

/**
 * **Une demande d'e-mail et son suivi** — l'agrégat du bloc `mail`.
 *
 * Il porte la seule règle qui peut refuser une écriture : une demande close
 * (`sent`, `refused`) ne repart pas. C'est ce qui rend un rejeu de la boîte
 * d'envoi sans effet chez le destinataire.
 *
 * Il ne porte PAS les données du modèle : le suivi garde ce que C7 nomme
 * (modèle, marque, destinataire, langue, état, identifiant fournisseur,
 * dates) et rien de plus.
 */
export class MailRequest {
  private constructor(private state: MailRequestSnapshot) {}

  /** La demande neuve, refusée si elle est mal formée. */
  static request(draft: MailRequestDraft): MailRequest {
    return new MailRequest({
      id: required("l'identifiant", draft.id, KEY_MAX),
      template: required("le modèle", draft.template, TEMPLATE_MAX),
      brand: MailBrand.of(draft.brand).code,
      recipient: required("le destinataire", draft.recipient, RECIPIENT_MAX),
      locale: draft.locale,
      idempotencyKey: required("la clé d'idempotence", draft.idempotencyKey, KEY_MAX),
      status: "requested",
      providerId: null,
      failureReason: null,
      requestedAt: draft.requestedAt,
      sentAt: null,
      failedAt: null,
    });
  }

  /** Relit une demande rangée ; la marque se revalide. */
  static rehydrate(snapshot: MailRequestSnapshot): MailRequest {
    return new MailRequest({ ...snapshot, brand: MailBrand.of(snapshot.brand).code });
  }

  get idempotencyKey(): string {
    return this.state.idempotencyKey;
  }

  get status(): MailRequestStatus {
    return this.state.status;
  }

  get providerId(): string | null {
    return this.state.providerId;
  }

  /** Close : envoyée ou refusée. Elle ne repart plus. */
  isSettled(): boolean {
    return this.state.status === "sent" || this.state.status === "refused";
  }

  /** Le fournisseur a accepté. `providerId` vaut `null` en mode à blanc. */
  markSent(providerId: string | null, at: Date): void {
    this.assertOpen();
    this.state = { ...this.state, status: "sent", providerId, sentAt: at, failureReason: null };
  }

  /** Échec technique : un nouvel essai reste permis. */
  markFailed(reason: string, at: Date): void {
    this.assertOpen();
    this.state = { ...this.state, status: "failed", failureReason: clipped(reason), failedAt: at };
  }

  /** Refus définitif : la demande est close. */
  markRefused(reason: string, at: Date): void {
    this.assertOpen();
    this.state = { ...this.state, status: "refused", failureReason: clipped(reason), failedAt: at };
  }

  snapshot(): MailRequestSnapshot {
    return this.state;
  }

  private assertOpen(): void {
    if (this.isSettled()) {
      throw new MailRequestAlreadySettledError(this.state.idempotencyKey, this.state.status);
    }
  }
}

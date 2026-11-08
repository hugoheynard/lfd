import {
  InvalidMailRequestError,
  MailRequestAlreadySettledError,
  MailRequestNotResumableError,
} from "../errors/mail-request.errors.js";
import { MailBrand, type MailBrandCode } from "../value-objects/mail-brand.js";
import {
  deliveryOutranks,
  type MailDelivery,
  type MailDeliveryReport,
} from "../value-objects/mail-delivery.js";

/**
 * Les états d'une demande (plan `plan-service-e-mails.md`, C7) :
 *
 * - `requested` — écrite, pas encore partie ;
 * - `sending` — un envoi différé est engagé (S1b, plan § 8) : marqué dans la
 *   transaction de livraison, il part après la validation. Une demande qui y
 *   reste est un envoi orphelin (redémarrage entre les deux), que le
 *   balayeur reprend avec la même clé ;
 * - `sent` — acceptée par le fournisseur (pas « arrivée » : `CLAUDE.md` § 0) ;
 * - `failed` — l'envoi a échoué pour une raison technique ; un nouvel essai
 *   peut réussir ;
 * - `refused` — refusée pour une raison que réessayer ne changera pas.
 *
 * `sent` et `refused` sont terminaux.
 */
export const MAIL_REQUEST_STATUSES = ["requested", "sending", "sent", "failed", "refused"] as const;

export type MailRequestStatus = (typeof MAIL_REQUEST_STATUSES)[number];

const TEMPLATE_MAX = 80;
const RECIPIENT_MAX = 320;
const KEY_MAX = 200;
const REASON_MAX = 500;
const HOUR_MS = 3_600_000;

/**
 * Jusqu'où une reprise est permise après la PREMIÈRE tentative : 23 h. Resend
 * garde une clé d'idempotence 24 h (documentation de Resend relue le
 * 2026-11-06, plan § 8) ; au-delà, un renvoi de même clé ne serait plus
 * dédoublonné, et un e-mail peut-être parti partirait deux fois. L'heure de
 * marge couvre le décalage des horloges et la durée d'un passage.
 */
export const MAIL_RESUME_WINDOW_MS = 23 * HOUR_MS;

/** Le plafond d'essais d'un envoi différé, le premier compris. */
export const MAX_MAIL_ATTEMPTS = 10;

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
  /**
   * L'adresse normalisée (minuscules) à laquelle une recherche compare (plan
   * `le-suivi-des-e-mails.md`, décision 9). Écrite par l'agrégat, jamais
   * par l'appelant.
   */
  readonly recipientKey: string;
  readonly locale: string | null;
  readonly idempotencyKey: string;
  readonly status: MailRequestStatus;
  readonly providerId: string | null;
  readonly failureReason: string | null;
  readonly requestedAt: Date;
  readonly sentAt: Date | null;
  readonly failedAt: Date | null;
  /** L'instant du premier envoi différé engagé ; `null` sans envoi différé. */
  readonly firstAttemptAt: Date | null;
  /** L'instant du dernier envoi différé engagé. */
  readonly lastAttemptAt: Date | null;
  /** Les envois différés engagés. `sendAndAwaitReceipt` n'en compte pas : il ne passe pas par `sending`. */
  readonly attempts: number;
  /**
   * La version publiée du document qui a composé l'envoi (plan
   * `plan-editeur-par-blocs.md`, § 5, S4c) ; `null` : le document de départ,
   * ou rien d'envoyé encore. Avec `template`, elle dit QUEL texte est parti.
   */
  readonly documentVersion: number | null;
  /** Le retour du fournisseur (décision 1) ; `null` : rien reçu. */
  readonly delivery: MailDelivery | null;
  readonly deliveryAt: Date | null;
  /** Le genre du retour (`Permanent/Suppressed`), jamais son texte. */
  readonly deliveryKind: string | null;
}

/** La clé de comparaison d'une adresse : la même règle à la création et en migration (`lower`). */
export function recipientKeyOf(recipient: string): string {
  return recipient.toLowerCase();
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

const GIVE_UP_REASON =
  "Envoi abandonné sans renvoi automatique : la première tentative date de plus de 23 h " +
  `ou ${MAX_MAIL_ATTEMPTS} essais ont été faits. Il est peut-être parti : vérifier au suivi ` +
  "de Resend, puis refaire une demande avec une nouvelle clé si besoin.";

/**
 * **Une demande d'e-mail et son suivi** — l'agrégat du bloc `mail`.
 *
 * Il porte les règles qui peuvent refuser une écriture : une demande close
 * (`sent`, `refused`) ne repart pas — c'est ce qui rend un rejeu de la boîte
 * d'envoi sans effet chez le destinataire ; et un envoi différé ne se reprend
 * pas au-delà de {@link MAIL_RESUME_WINDOW_MS} ni de {@link MAX_MAIL_ATTEMPTS}
 * (S1b, plan § 8).
 *
 * Il ne porte PAS les données du modèle : le suivi garde ce que C7 nomme
 * (modèle, marque, destinataire, langue, état, identifiant fournisseur,
 * dates) et rien de plus.
 */
export class MailRequest {
  private constructor(private state: MailRequestSnapshot) {}

  /** La demande neuve, refusée si elle est mal formée. */
  static request(draft: MailRequestDraft): MailRequest {
    const recipient = required("le destinataire", draft.recipient, RECIPIENT_MAX);
    return new MailRequest({
      id: required("l'identifiant", draft.id, KEY_MAX),
      template: required("le modèle", draft.template, TEMPLATE_MAX),
      brand: MailBrand.of(draft.brand).code,
      recipient,
      recipientKey: recipientKeyOf(recipient),
      locale: draft.locale,
      idempotencyKey: required("la clé d'idempotence", draft.idempotencyKey, KEY_MAX),
      status: "requested",
      providerId: null,
      failureReason: null,
      requestedAt: draft.requestedAt,
      sentAt: null,
      failedAt: null,
      firstAttemptAt: null,
      lastAttemptAt: null,
      attempts: 0,
      documentVersion: null,
      delivery: null,
      deliveryAt: null,
      deliveryKind: null,
    });
  }

  /** Relit une demande rangée ; la marque se revalide. */
  static rehydrate(snapshot: MailRequestSnapshot): MailRequest {
    return new MailRequest({ ...snapshot, brand: MailBrand.of(snapshot.brand).code });
  }

  get id(): string {
    return this.state.id;
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

  /**
   * Peut-on engager l'envoi différé maintenant ? Une demande neuve, ou un
   * échec encore reprenable. `sending` n'y est pas : l'envoi est déjà engagé,
   * et seul le balayeur le reprend, passé son délai.
   */
  isSendable(at: Date): boolean {
    return (
      this.state.status === "requested" || (this.state.status === "failed" && this.canResume(at))
    );
  }

  /**
   * Un envoi différé déjà engagé (`sending` orphelin, `failed`) peut-il
   * repartir, avec la même clé ? Seulement dans la fenêtre comptée depuis la
   * première tentative, et sous le plafond d'essais. Un échec de `sendAndAwaitReceipt`
   * (sans tentative différée) ne se reprend jamais seul : l'équipe a vu
   * l'erreur à l'écran, et c'est à elle de refaire le geste.
   */
  canResume(at: Date): boolean {
    const { status, firstAttemptAt, attempts } = this.state;
    if ((status !== "sending" && status !== "failed") || firstAttemptAt === null) {
      return false;
    }
    const elapsed = at.getTime() - firstAttemptAt.getTime();
    return elapsed < MAIL_RESUME_WINDOW_MS && attempts < MAX_MAIL_ATTEMPTS;
  }

  /**
   * Engage un envoi différé : `requested → sending`, ou une reprise
   * (`failed`/`sending → sending`) tant que {@link canResume} le permet.
   *
   * @throws {MailRequestAlreadySettledError} la demande est close.
   * @throws {MailRequestNotResumableError} fenêtre ou plafond dépassé.
   */
  beginSending(at: Date): void {
    this.assertOpen();
    if (this.state.status === "requested") {
      this.state = {
        ...this.state,
        status: "sending",
        firstAttemptAt: at,
        lastAttemptAt: at,
        attempts: 1,
      };
      return;
    }
    if (!this.canResume(at)) {
      throw new MailRequestNotResumableError(this.state.idempotencyKey, this.state.attempts);
    }
    this.state = {
      ...this.state,
      status: "sending",
      lastAttemptAt: at,
      attempts: this.state.attempts + 1,
    };
  }

  /**
   * Le balayeur renonce à un envoi engagé qu'il ne peut plus reprendre :
   * `failed`, visible au suivi, et un humain décide (plan § 8). Il est
   * peut-être parti : seul le suivi de Resend le dira.
   *
   * @throws {MailRequestNotResumableError} la demande n'est pas un envoi
   *   engagé, ou elle est encore reprenable — y renoncer serait une faute.
   */
  giveUp(at: Date): void {
    if (this.state.status !== "sending" || this.canResume(at)) {
      throw new MailRequestNotResumableError(this.state.idempotencyKey, this.state.attempts);
    }
    this.markFailed(GIVE_UP_REASON, at);
  }

  /**
   * Le fournisseur a accepté. `providerId` vaut `null` en mode à blanc ;
   * `documentVersion`, la version du document qui a composé l'e-mail (S4c),
   * `null` pour le document de départ.
   */
  markSent(providerId: string | null, at: Date, documentVersion: number | null = null): void {
    this.assertOpen();
    this.state = {
      ...this.state,
      status: "sent",
      providerId,
      sentAt: at,
      failureReason: null,
      documentVersion,
    };
  }

  /**
   * Applique un retour du fournisseur, **vers le haut seulement** (décision
   * 3) : un retour moins grave que celui qu'elle porte, ou égal, ne change
   * rien — c'est ce qui rend un webhook rejoué ou arrivé dans le désordre
   * sans effet. Indépendant de `status` : une demande acceptée puis rebondie
   * n'a pas échoué de notre côté, et la reprise ne la relance pas.
   *
   * @returns `true` si la demande a changé (à ranger), `false` sinon.
   */
  recordDelivery(report: MailDeliveryReport): boolean {
    if (!deliveryOutranks(report.delivery, this.state.delivery)) {
      return false;
    }
    this.state = {
      ...this.state,
      delivery: report.delivery,
      deliveryAt: report.at,
      deliveryKind: report.kind,
    };
    return true;
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

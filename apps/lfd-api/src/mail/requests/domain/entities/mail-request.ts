import {
  InvalidMailRequestError,
  MailRequestAlreadySettledError,
  MailRequestNotResumableError,
} from "../errors/mail-request.errors.js";
import type { MailSubject } from "../../../channels/requests/mail-subject.js";
import type { MailDeliveryFailure } from "../events/mail-delivery-failure.js";
import { MailBrand } from "../value-objects/mail-brand.js";
import { MAIL_REFUSAL_REASONS, type MailRefusalCode } from "../value-objects/mail-refusal-code.js";
import { mailRequestSubjectsOf } from "../value-objects/mail-request-subject.js";
import {
  deliveryOutranks,
  isDeliveryFailure,
  type MailDeliveryReport,
} from "../value-objects/mail-delivery.js";
import type {
  MailRequestDraft,
  MailRequestSnapshot,
  MailRequestStatus,
} from "./mail-request-state.js";

export {
  MAIL_REQUEST_STATUSES,
  type MailRequestDraft,
  type MailRequestSnapshot,
  type MailRequestStatus,
} from "./mail-request-state.js";

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
  /** Les entrées dans l'échec notées depuis la dernière écriture ; le dépôt les vide. */
  private failures: MailDeliveryFailure[] = [];

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
      refusalCode: null,
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
      subjects: mailRequestSubjectsOf(draft.subjects ?? []),
    });
  }

  /** Relit une demande rangée ; la marque et les sujets se revalident. */
  static rehydrate(snapshot: MailRequestSnapshot): MailRequest {
    return new MailRequest({
      ...snapshot,
      brand: MailBrand.of(snapshot.brand).code,
      subjects: mailRequestSubjectsOf(snapshot.subjects),
    });
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

  get subjects(): readonly MailSubject[] {
    return this.state.subjects;
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
   * Une demande qui porte au moins un sujet et ENTRE dans l'échec (de rien,
   * `delayed` ou `delivered` vers `complained` ou `bounced`) note une
   * {@link MailDeliveryFailure} (`le-sujet-des-e-mails.md`, règle 4) ;
   * `complained` puis `bounced` n'en note qu'une : l'échelle monte, la
   * personne à prévenir est la même.
   *
   * @returns `true` si la demande a changé (à ranger), `false` sinon.
   */
  recordDelivery(report: MailDeliveryReport): boolean {
    if (!deliveryOutranks(report.delivery, this.state.delivery)) {
      return false;
    }
    if (
      isDeliveryFailure(report.delivery) &&
      !isDeliveryFailure(this.state.delivery) &&
      this.state.subjects.length > 0
    ) {
      this.failures.push({
        requestId: this.state.id,
        template: this.state.template,
        subjects: this.state.subjects,
        delivery: report.delivery,
        kind: report.kind,
        at: report.at,
      });
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

  /**
   * Refus pour préférence marketing (plan de désinscription, règle 11) : la
   * demande est close avec sa raison FERMÉE, que le suivi affiche.
   */
  markRefusedFor(code: MailRefusalCode, at: Date): void {
    this.assertOpen();
    this.state = {
      ...this.state,
      status: "refused",
      failureReason: MAIL_REFUSAL_REASONS[code],
      refusalCode: code,
      failedAt: at,
    };
  }

  /**
   * Rend et oublie les entrées dans l'échec notées : le dépôt les écrit à la
   * boîte d'envoi avec la demande, une fois.
   */
  pullDeliveryFailures(): readonly MailDeliveryFailure[] {
    const pulled = this.failures;
    this.failures = [];
    return pulled;
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

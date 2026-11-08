import type { InboundMailNotice } from "../../../platform/mailer/inbound/inbound-mail.sink.js";
import {
  deliveryKindOf,
  type MailDelivery,
} from "../../requests/domain/value-objects/mail-delivery.js";

/**
 * **Ce qu'on retient d'un retour Resend**, et rien d'autre.
 *
 * La charge est lue **défensivement** : elle vient du réseau, et une forme
 * inattendue doit donner « je ne sais pas quoi en faire » plutôt qu'une
 * exception au milieu d'un webhook — un `500` ferait réessayer Resend
 * indéfiniment pour un message qu'on ne saura jamais lire.
 *
 * Du rebond, seul le GENRE est lu (`bounce.type`, `bounce.subType` — forme
 * relue dans les types du SDK `resend` 6.18.1 le 2026-11-08 : `EmailBounce {
 * message, subType, type }`). `bounce.message` n'est JAMAIS lu : il cite
 * souvent l'adresse (plan `plan-suivi-des-e-mails.md`, décision 4).
 */
export interface ResendEvent {
  readonly delivery: MailDelivery;
  readonly providerId: string;
  /** `Permanent/Suppressed`… ; `null` hors rebond ou forme inconnue. */
  readonly kind: string | null;
  /** Le `created_at` de l'événement ; `null` s'il manque ou ne se lit pas. */
  readonly occurredAt: Date | null;
}

/**
 * Les types qu'on range. Écartés exprès : `email.sent` redit l'acceptation,
 * que le `status` de la demande porte déjà (décision 1) ; `email.opened` et
 * `email.clicked` disent ce qu'une personne a fait de son courrier, ce qui ne
 * nous regarde pas.
 */
const DELIVERY_OF_TYPE: Readonly<Record<string, MailDelivery>> = {
  "email.delivery_delayed": "delayed",
  "email.delivered": "delivered",
  "email.complained": "complained",
  "email.bounced": "bounced",
};

/** Lit un retour, ou rend `null` si on ne sait pas quoi en faire. */
export function readResendEvent(payload: unknown): ResendEvent | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const type = readString(payload, "type");
  const delivery = type === null ? undefined : DELIVERY_OF_TYPE[type];
  if (delivery === undefined) {
    return null;
  }
  const data = readObject(payload, "data");
  const providerId = data === null ? null : readString(data, "email_id");
  if (data === null || providerId === null) {
    return null;
  }
  return { delivery, providerId, kind: kindOf(data), occurredAt: occurredAtOf(payload) };
}

/** Le type d'un e-mail REÇU (plan `plan-reponses-par-e-mail.md`, R2). */
export const EMAIL_RECEIVED = "email.received";

/**
 * Un e-mail reçu (`email.received`) : son identifiant Resend, ou `null` si
 * l'événement est d'un autre type ou ne se lit pas. Le reste (expéditeur,
 * objet, texte) est relu chez Resend par le contexte qui le range.
 */
export function readReceivedEmail(payload: unknown): InboundMailNotice | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  if (readString(payload, "type") !== EMAIL_RECEIVED) {
    return null;
  }
  const data = readObject(payload, "data");
  const emailId = data === null ? null : readString(data, "email_id");
  return emailId === null ? null : { emailId };
}

/** Le genre d'un rebond ; jamais son texte. */
function kindOf(data: object): string | null {
  const bounce = readObject(data, "bounce");
  if (bounce === null) {
    return null;
  }
  return deliveryKindOf(readString(bounce, "type"), readString(bounce, "subType"));
}

function occurredAtOf(payload: object): Date | null {
  const raw = readString(payload, "created_at");
  if (raw === null) {
    return null;
  }
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at;
}

function readObject(source: object, key: string): object | null {
  const value: unknown = key in source ? Reflect.get(source, key) : null;
  return typeof value === "object" && value !== null ? value : null;
}

function readString(source: object, key: string): string | null {
  if (!(key in source)) {
    return null;
  }
  const value: unknown = Reflect.get(source, key);
  return typeof value === "string" && value !== "" ? value : null;
}

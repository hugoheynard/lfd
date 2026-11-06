import type { DurableFact } from "../../../platform/outbox/durable-event.js";
import { InvalidMailRequestError } from "../domain/errors/mail-request.errors.js";
import type { OutgoingMail } from "../domain/ports/mail-dispatch.js";

/** Le type du fait — clé de routage vers l'abonné du bloc. */
export const MAIL_REQUESTED = "mail.requested";

/** La clé déterministe du fait d'une demande — c'est par elle que le balayeur relit ses données. */
export function mailRequestedKey(idempotencyKey: string): string {
  return `${MAIL_REQUESTED}:${idempotencyKey}`;
}

/**
 * **Un e-mail est demandé** : le fait que `request` écrit dans la transaction
 * de l'appelant. Il porte ce qu'il faut pour envoyer sans rien relire chez
 * l'appelant — les données du modèle comprises, qui ne vont PAS dans le suivi.
 *
 * Clé déterministe sur la clé d'idempotence : deux demandes de même clé ne
 * s'écrivent qu'une fois dans la boîte d'envoi.
 */
export function mailRequestedFact(mail: OutgoingMail): DurableFact {
  return {
    type: MAIL_REQUESTED,
    key: mailRequestedKey(mail.idempotencyKey),
    payload: {
      template: mail.template,
      to: mail.to,
      data: mail.data,
      idempotencyKey: mail.idempotencyKey,
    },
  };
}

function text(payload: Readonly<Record<string, unknown>>, field: string): string {
  const value = payload[field];
  if (typeof value !== "string") {
    throw new InvalidMailRequestError(`le champ « ${field} » du fait ${MAIL_REQUESTED}`, "manque");
  }
  return value;
}

/** Relit le fait livré ; un fait mal formé est refusé, pas deviné. */
export function outgoingMailOf(payload: Readonly<Record<string, unknown>>): OutgoingMail {
  return {
    template: text(payload, "template"),
    to: text(payload, "to"),
    data: payload["data"],
    idempotencyKey: text(payload, "idempotencyKey"),
  };
}

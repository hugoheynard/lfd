import type { DurableFact } from "../../../platform/outbox/durable-event.js";
import { InvalidMailRequestError } from "../domain/errors/mail-request.errors.js";
import type { OutgoingMail } from "../domain/ports/mail-dispatch.js";
import { mailRequestSubjectsOf } from "../domain/value-objects/mail-request-subject.js";

/** Le type du fait — clé de routage vers l'abonné du bloc. */
export const MAIL_REQUESTED = "mail.requested";

/** La clé déterministe du fait d'une demande — c'est par elle que le balayeur relit ses données. */
export function mailRequestedKey(idempotencyKey: string): string {
  return `${MAIL_REQUESTED}:${idempotencyKey}`;
}

/**
 * **Un e-mail est demandé** : le fait que `send` écrit dans la transaction
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
      // Rejouée par le balayeur, qui ne relit que ce fait ; jamais rangée au suivi.
      ...(mail.replyTo === undefined ? {} : { replyTo: mail.replyTo }),
      // Les sujets traversent la boîte d'envoi (`le-sujet-des-e-mails.md`,
      // règle 2) : le fait différé dit pour quoi il part, comme la fiche.
      ...(mail.subjects === undefined ? {} : { subjects: mail.subjects }),
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

/** Un champ facultatif : absent, ou une chaîne. */
function optionalText(
  payload: Readonly<Record<string, unknown>>,
  field: string,
): string | undefined {
  return payload[field] === undefined ? undefined : text(payload, field);
}

/** Une entrée de la liste des sujets, relue du `jsonb` : un objet à deux chaînes. */
function rawSubject(entry: unknown): { readonly type: string; readonly id: string } {
  if (typeof entry === "object" && entry !== null && "type" in entry && "id" in entry) {
    const { type, id } = entry;
    if (typeof type === "string" && typeof id === "string") {
      return { type, id };
    }
  }
  throw new InvalidMailRequestError(`un sujet du fait ${MAIL_REQUESTED}`, "est mal formé");
}

/** Les sujets du fait, revalidés ; absents d'un fait écrit avant eux. */
function subjectsOf(payload: Readonly<Record<string, unknown>>): OutgoingMail["subjects"] {
  const raw = payload["subjects"];
  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    throw new InvalidMailRequestError(
      `les sujets du fait ${MAIL_REQUESTED}`,
      "ne sont pas une liste",
    );
  }
  return mailRequestSubjectsOf(raw.map(rawSubject));
}

/** Relit le fait livré ; un fait mal formé est refusé, pas deviné. */
export function outgoingMailOf(payload: Readonly<Record<string, unknown>>): OutgoingMail {
  const replyTo = optionalText(payload, "replyTo");
  const subjects = subjectsOf(payload);
  return {
    template: text(payload, "template"),
    to: text(payload, "to"),
    data: payload["data"],
    idempotencyKey: text(payload, "idempotencyKey"),
    ...(replyTo === undefined ? {} : { replyTo }),
    ...(subjects === undefined ? {} : { subjects }),
  };
}

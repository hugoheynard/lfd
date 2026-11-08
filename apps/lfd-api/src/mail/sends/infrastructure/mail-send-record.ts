import {
  type MailRequestRow,
  toDomain,
} from "../../requests/infrastructure/prisma-mail-request.repository.js";
import type { MailSendRecord } from "../domain/ports/mail-send.reader.js";

/**
 * Une ligne de `mail_request` lue par le suivi : relue par l'agrégat (ses
 * valeurs revalidées), puis rendue SANS `failure_reason` — elle ne se sert
 * qu'avec une révélation.
 */
export function toMailSendRecord(row: MailRequestRow): MailSendRecord {
  const state = toDomain(row).snapshot();
  return {
    id: state.id,
    template: state.template,
    space: state.brand,
    recipient: state.recipient,
    locale: state.locale,
    status: state.status,
    providerId: state.providerId,
    requestedAt: state.requestedAt,
    sentAt: state.sentAt,
    failedAt: state.failedAt,
    firstAttemptAt: state.firstAttemptAt,
    lastAttemptAt: state.lastAttemptAt,
    attempts: state.attempts,
    documentVersion: state.documentVersion,
    delivery: state.delivery,
    deliveryAt: state.deliveryAt,
    deliveryKind: state.deliveryKind,
    refusalCode: state.refusalCode,
    subjects: state.subjects,
  };
}

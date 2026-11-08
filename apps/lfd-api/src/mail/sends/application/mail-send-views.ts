import type { MailSendDetailView, MailSendListItemView } from "@lfd/contracts";

import type { MailSendRecord } from "../domain/ports/mail-send.reader.js";
import { maskRecipient } from "../domain/services/recipient-mask.js";
import {
  mailSendDeliveryOf,
  mailSendStateOf,
  NO_PROBLEM,
  problemRankOf,
} from "../domain/services/mail-send-state.js";
import { mailSendStepsOf } from "../domain/services/mail-send-steps.js";

/** Une ligne de la liste : l'adresse MASQUÉE, les états en codes anglais. */
export function toMailSendListItem(record: MailSendRecord): MailSendListItemView {
  return {
    id: record.id,
    template: record.template,
    space: record.space,
    recipient: maskRecipient(record.recipient),
    state: mailSendStateOf(record.status),
    delivery: mailSendDeliveryOf(record.status, record.providerId, record.delivery),
    requestedAt: record.requestedAt.toISOString(),
    problem: problemRankOf(record.status, record.delivery) < NO_PROBLEM,
  };
}

/** Le détail : la ligne, ses étapes, la version du document — jamais la raison d'un échec. */
export function toMailSendDetail(record: MailSendRecord): MailSendDetailView {
  return {
    ...toMailSendListItem(record),
    locale: record.locale,
    deliveryKind: record.deliveryKind,
    documentVersion: record.documentVersion,
    attempts: record.attempts,
    steps: mailSendStepsOf(record).map((step) => ({
      step: step.step,
      at: step.at.toISOString(),
    })),
  };
}

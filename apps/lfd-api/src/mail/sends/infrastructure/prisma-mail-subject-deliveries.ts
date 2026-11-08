import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  MailSubjectDeliveries,
  type SubjectMail,
} from "../../channels/deliveries/mail-subject-deliveries.js";
import type { MailSubjectType } from "../../channels/requests/mail-subject.js";
import {
  deliveryOf,
  statusOf,
} from "../../requests/infrastructure/prisma-mail-request.repository.js";
import { mailSendDeliveryOf, mailSendStateOf } from "../domain/services/mail-send-state.js";

/** Ce que la lecture prend de la fiche — ni l'adresse, ni la raison d'un échec. */
interface SubjectMailRow {
  readonly id: string;
  readonly template: string;
  readonly requestedAt: Date;
  readonly status: string;
  readonly providerId: string | null;
  readonly delivery: string | null;
  readonly deliveryAt: Date | null;
}

function toSubjectMail(row: SubjectMailRow): SubjectMail {
  const status = statusOf(row.status);
  return {
    requestId: row.id,
    template: row.template,
    requestedAt: row.requestedAt,
    state: mailSendStateOf(status),
    delivery: mailSendDeliveryOf(status, row.providerId, deliveryOf(row.delivery)),
    deliveryAt: row.deliveryAt,
  };
}

/**
 * Les e-mails de ces sujets (`plan-sujet-des-e-mails.md`, règle 6), en UNE
 * lecture par l'index `(subject_type, subject_id)` : la table des sujets et
 * sa demande, sans `recipient` ni `failure_reason` dans le `select`.
 */
@Injectable()
export class PrismaMailSubjectDeliveries extends MailSubjectDeliveries {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async forSubjects(
    type: MailSubjectType,
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, readonly SubjectMail[]>> {
    const found = new Map<string, SubjectMail[]>();
    if (ids.length === 0) {
      return found;
    }
    const rows = await this.prisma.mailRequestSubject.findMany({
      where: { subjectType: type, subjectId: { in: [...ids] } },
      select: {
        subjectId: true,
        request: {
          select: {
            id: true,
            template: true,
            requestedAt: true,
            status: true,
            providerId: true,
            delivery: true,
            deliveryAt: true,
          },
        },
      },
      orderBy: [{ request: { requestedAt: "desc" } }, { requestId: "desc" }],
    });
    for (const row of rows) {
      const mails = found.get(row.subjectId) ?? [];
      mails.push(toSubjectMail(row.request));
      found.set(row.subjectId, mails);
    }
    return found;
  }
}

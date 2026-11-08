import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  type MailRequestRow,
  type MailRequestSubjectRow,
  WITH_SUBJECTS,
} from "../../requests/infrastructure/prisma-mail-request.repository.js";
import {
  type MailSendFilter,
  type MailSendPosition,
  MailSendReader,
  type MailSendRecord,
} from "../domain/ports/mail-send.reader.js";
import { toMailSendRecord } from "./mail-send-record.js";

/**
 * Le rang de problème, en SQL — la même règle que `problemRankOf`, éprouvée
 * par l'e2e : échoué ou refusé (0), rebondi ou spam (1), retardé (2), le reste.
 */
const RANK = Prisma.sql`CASE
  WHEN r."status" IN ('failed', 'refused') THEN 0
  WHEN r."delivery" IN ('bounced', 'complained') THEN 1
  WHEN r."delivery" = 'delayed' THEN 2
  ELSE 3 END`;

/** Les colonnes, sous les noms de `MailRequestRow`. */
const COLUMNS = Prisma.sql`r."id", r."template", r."brand", r."recipient", r."locale",
  r."status", r."provider_id" AS "providerId", r."idempotency_key" AS "idempotencyKey",
  r."failure_reason" AS "failureReason", r."requested_at" AS "requestedAt",
  r."sent_at" AS "sentAt", r."failed_at" AS "failedAt",
  r."first_attempt_at" AS "firstAttemptAt", r."last_attempt_at" AS "lastAttemptAt",
  r."attempts", r."document_version" AS "documentVersion",
  r."recipient_key" AS "recipientKey", r."delivery", r."delivery_at" AS "deliveryAt",
  r."delivery_kind" AS "deliveryKind"`;

function conditionsOf(filter: MailSendFilter): Prisma.Sql[] {
  const where: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (filter.space !== null) where.push(Prisma.sql`r."brand" = ${filter.space}`);
  if (filter.template !== null) where.push(Prisma.sql`r."template" = ${filter.template}`);
  if (filter.status !== null) where.push(Prisma.sql`r."status" = ${filter.status}`);
  if (filter.delivery === "dry_run") {
    where.push(Prisma.sql`r."status" = 'sent' AND r."provider_id" IS NULL`);
  } else if (filter.delivery !== null) {
    where.push(Prisma.sql`r."delivery" = ${filter.delivery}`);
  }
  if (filter.from !== null) where.push(Prisma.sql`r."requested_at" >= ${filter.from}`);
  if (filter.to !== null) where.push(Prisma.sql`r."requested_at" < ${filter.to}`);
  if (filter.onlyTemplates !== null) where.push(inTemplates(filter.onlyTemplates));
  if (filter.exceptTemplates.length > 0) {
    where.push(Prisma.sql`NOT (${inTemplates(filter.exceptTemplates)})`);
  }
  return where;
}

function inTemplates(templates: readonly string[]): Prisma.Sql {
  return templates.length === 0
    ? Prisma.sql`FALSE`
    : Prisma.sql`r."template" IN (${Prisma.join([...templates])})`;
}

/** Après la position : rang croissant, puis instant et identifiant décroissants. */
function afterPosition(position: MailSendPosition): Prisma.Sql {
  return Prisma.sql`(${RANK} > ${position.rank}
    OR (${RANK} = ${position.rank} AND (r."requested_at", r."id") < (${position.requestedAt}, ${position.id})))`;
}

/**
 * La lecture du suivi des envois, dans le schéma `mail`. La liste est en SQL
 * écrit : l'ordre « problèmes d'abord » est une expression, que Prisma ne
 * sait pas trier. La raison d'un échec est lue avec la ligne (la forme de
 * `MailRequestRow`) mais ne sort pas de cet adaptateur (`toMailSendRecord`).
 */
@Injectable()
export class PrismaMailSendReader extends MailSendReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async page(
    filter: MailSendFilter,
    after: MailSendPosition | null,
    limit: number,
  ): Promise<readonly MailSendRecord[]> {
    const where = [...conditionsOf(filter), ...(after === null ? [] : [afterPosition(after)])];
    const rows = await this.prisma.$queryRaw<MailRequestRow[]>`
      SELECT ${COLUMNS} FROM "mail"."mail_request" r
       WHERE ${Prisma.join(where, " AND ")}
       ORDER BY ${RANK} ASC, r."requested_at" DESC, r."id" DESC
       LIMIT ${limit}`;
    return this.withSubjects(rows);
  }

  async byIds(ids: readonly string[]): Promise<readonly MailSendRecord[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.$queryRaw<MailRequestRow[]>`
      SELECT ${COLUMNS} FROM "mail"."mail_request" r
       WHERE r."id" IN (${Prisma.join([...ids])})
       ORDER BY ${RANK} ASC, r."requested_at" DESC, r."id" DESC`;
    return this.withSubjects(rows);
  }

  async detail(id: string): Promise<MailSendRecord | null> {
    const row = await this.prisma.mailRequest.findUnique({ where: { id }, include: WITH_SUBJECTS });
    return row === null ? null : toMailSendRecord(row);
  }

  /**
   * Les sujets des lignes lues, en UNE lecture par lot (`plan-sujet-des-e-mails.md`,
   * règle 9) : la liste est en SQL écrit, qui ne joint pas la table enfant.
   */
  private async withSubjects(rows: readonly MailRequestRow[]): Promise<readonly MailSendRecord[]> {
    if (rows.length === 0) {
      return [];
    }
    const subjects = await this.prisma.mailRequestSubject.findMany({
      where: { requestId: { in: rows.map((row) => row.id) } },
      select: { requestId: true, subjectType: true, subjectId: true },
    });
    const byRequest = new Map<string, MailRequestSubjectRow[]>();
    for (const subject of subjects) {
      const list = byRequest.get(subject.requestId) ?? [];
      list.push({ subjectType: subject.subjectType, subjectId: subject.subjectId });
      byRequest.set(subject.requestId, list);
    }
    return rows.map((row) => toMailSendRecord({ ...row, subjects: byRequest.get(row.id) ?? [] }));
  }
}

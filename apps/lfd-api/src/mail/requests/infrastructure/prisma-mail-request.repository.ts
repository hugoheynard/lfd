import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  MAIL_REQUEST_STATUSES,
  MailRequest,
  type MailRequestSnapshot,
  type MailRequestStatus,
  recipientKeyOf,
} from "../domain/entities/mail-request.js";
import { UnknownMailRequestStatusError } from "../domain/errors/mail-request.errors.js";
import { MailRequestRepository } from "../domain/ports/mail-request.repository.js";
import { MailBrand } from "../domain/value-objects/mail-brand.js";
import { mailRequestSubjectsOf } from "../domain/value-objects/mail-request-subject.js";
import { type MailDelivery, mailDeliveryOf } from "../domain/value-objects/mail-delivery.js";

/** La ligne telle que Prisma la rend — confinée à `infrastructure/`. */
export interface MailRequestRow {
  readonly id: string;
  readonly template: string;
  readonly brand: string;
  readonly recipient: string;
  readonly locale: string | null;
  readonly status: string;
  readonly providerId: string | null;
  readonly idempotencyKey: string;
  readonly failureReason: string | null;
  readonly requestedAt: Date;
  readonly sentAt: Date | null;
  readonly failedAt: Date | null;
  readonly firstAttemptAt: Date | null;
  readonly lastAttemptAt: Date | null;
  readonly attempts: number;
  readonly documentVersion: number | null;
  readonly recipientKey: string | null;
  readonly delivery: string | null;
  readonly deliveryAt: Date | null;
  readonly deliveryKind: string | null;
  /**
   * Les sujets, quand la lecture les a joints (`plan-sujet-des-e-mails.md`,
   * E1). Absents d'une lecture qui ne les demande pas (la liste du suivi en
   * SQL écrit, le balayeur) : la demande relue n'en porte alors aucun, et
   * `save` ne les touche jamais — ils sont fixés à la demande.
   */
  readonly subjects?: readonly MailRequestSubjectRow[];
}

/** Une ligne de `mail.mail_request_subject`. */
export interface MailRequestSubjectRow {
  readonly subjectType: string;
  readonly subjectId: string;
}

/** La jointure des sujets, pour une lecture qui relit l'agrégat entier. */
export const WITH_SUBJECTS = {
  subjects: { select: { subjectType: true, subjectId: true } },
} as const;

export function statusOf(raw: string): MailRequestStatus {
  const status = MAIL_REQUEST_STATUSES.find((known) => known === raw);
  if (status === undefined) {
    // Le CHECK en base l'interdit ; une valeur inconnue ici est un schéma en
    // avance sur ce binaire, pas une donnée à deviner.
    throw new UnknownMailRequestStatusError(raw);
  }
  return status;
}

export function deliveryOf(raw: string | null): MailDelivery | null {
  if (raw === null) {
    return null;
  }
  const delivery = mailDeliveryOf(raw);
  if (delivery === null) {
    // Même raison que pour `status` : le CHECK en base l'interdit.
    throw new UnknownMailRequestStatusError(raw);
  }
  return delivery;
}

/** Relit une ligne ; partagé avec la lecture du balayeur. */
export function toDomain(row: MailRequestRow): MailRequest {
  return MailRequest.rehydrate({
    ...row,
    brand: MailBrand.of(row.brand).code,
    status: statusOf(row.status),
    // Une demande écrite par un binaire d'avant T1 n'a pas de clé : elle se
    // calcule par la même règle, et le prochain `save` l'écrit.
    recipientKey: row.recipientKey ?? recipientKeyOf(row.recipient),
    delivery: deliveryOf(row.delivery),
    subjects: mailRequestSubjectsOf(
      (row.subjects ?? []).map((subject) => ({ type: subject.subjectType, id: subject.subjectId })),
    ),
  });
}

/** La ligne de `mail_request` — les sujets vont dans leur table. */
function toPersistence(request: MailRequest): Omit<MailRequestSnapshot, "subjects"> {
  const state = request.snapshot();
  return {
    id: state.id,
    template: state.template,
    brand: state.brand,
    recipient: state.recipient,
    recipientKey: state.recipientKey,
    locale: state.locale,
    idempotencyKey: state.idempotencyKey,
    status: state.status,
    providerId: state.providerId,
    failureReason: state.failureReason,
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
  };
}

/** Les lignes de `mail_request_subject` d'une demande. */
function subjectRowsOf(
  request: MailRequest,
): { requestId: string; subjectType: string; subjectId: string }[] {
  return request.subjects.map((subject) => ({
    requestId: request.id,
    subjectType: subject.type,
    subjectId: subject.id,
  }));
}

/**
 * Le suivi des demandes, dans le schéma `mail`. Passe par le client ambiant :
 * sous une unité de travail, il écrit dans la transaction de l'appelant.
 */
@Injectable()
export class PrismaMailRequestRepository extends MailRequestRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByIdempotencyKey(key: string): Promise<MailRequest | null> {
    const row = await this.prisma.mailRequest.findUnique({
      where: { idempotencyKey: key },
      include: WITH_SUBJECTS,
    });
    return row === null ? null : toDomain(row);
  }

  /**
   * `skipDuplicates` (`ON CONFLICT DO NOTHING`) et non un `create` rattrapé :
   * une violation d'unicité annulerait la transaction de l'appelant. Les
   * sujets ne s'écrivent que pour une demande neuve : une clé connue garde
   * ceux de sa première demande.
   */
  async addIfAbsent(request: MailRequest): Promise<boolean> {
    const { count } = await this.prisma.mailRequest.createMany({
      data: [toPersistence(request)],
      skipDuplicates: true,
    });
    if (count === 1) {
      await this.addSubjects(request);
    }
    return count === 1;
  }

  /** Toutes les demandes de cet identifiant : l'index n'est pas unique (décision 3). */
  async findByProviderId(providerId: string): Promise<readonly MailRequest[]> {
    const rows = await this.prisma.mailRequest.findMany({
      where: { providerId },
      include: WITH_SUBJECTS,
    });
    return rows.map(toDomain);
  }

  /**
   * Les sujets sont fixés à la demande : `save` les écrit à la création
   * (l'envoi immédiat d'une clé neuve) et ne les touche plus ensuite — une
   * demande relue sans eux (le balayeur) ne les efface donc pas.
   */
  async save(request: MailRequest): Promise<void> {
    const row = toPersistence(request);
    const subjects = subjectRowsOf(request).map(({ subjectType, subjectId }) => ({
      subjectType,
      subjectId,
    }));
    await this.prisma.mailRequest.upsert({
      where: { idempotencyKey: row.idempotencyKey },
      create: {
        ...row,
        ...(subjects.length === 0 ? {} : { subjects: { createMany: { data: subjects } } }),
      },
      update: {
        status: row.status,
        providerId: row.providerId,
        failureReason: row.failureReason,
        sentAt: row.sentAt,
        failedAt: row.failedAt,
        firstAttemptAt: row.firstAttemptAt,
        lastAttemptAt: row.lastAttemptAt,
        attempts: row.attempts,
        documentVersion: row.documentVersion,
        recipientKey: row.recipientKey,
        delivery: row.delivery,
        deliveryAt: row.deliveryAt,
        deliveryKind: row.deliveryKind,
      },
    });
  }

  private async addSubjects(request: MailRequest): Promise<void> {
    const rows = subjectRowsOf(request);
    if (rows.length > 0) {
      await this.prisma.mailRequestSubject.createMany({ data: rows, skipDuplicates: true });
    }
  }
}

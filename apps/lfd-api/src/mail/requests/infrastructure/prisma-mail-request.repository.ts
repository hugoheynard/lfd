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
}

function statusOf(raw: string): MailRequestStatus {
  const status = MAIL_REQUEST_STATUSES.find((known) => known === raw);
  if (status === undefined) {
    // Le CHECK en base l'interdit ; une valeur inconnue ici est un schéma en
    // avance sur ce binaire, pas une donnée à deviner.
    throw new UnknownMailRequestStatusError(raw);
  }
  return status;
}

function deliveryOf(raw: string | null): MailDelivery | null {
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
  });
}

function toPersistence(request: MailRequest): MailRequestSnapshot {
  return request.snapshot();
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
    const row = await this.prisma.mailRequest.findUnique({ where: { idempotencyKey: key } });
    return row === null ? null : toDomain(row);
  }

  /**
   * `skipDuplicates` (`ON CONFLICT DO NOTHING`) et non un `create` rattrapé :
   * une violation d'unicité annulerait la transaction de l'appelant.
   */
  async addIfAbsent(request: MailRequest): Promise<boolean> {
    const { count } = await this.prisma.mailRequest.createMany({
      data: [toPersistence(request)],
      skipDuplicates: true,
    });
    return count === 1;
  }

  /** Toutes les demandes de cet identifiant : l'index n'est pas unique (décision 3). */
  async findByProviderId(providerId: string): Promise<readonly MailRequest[]> {
    const rows = await this.prisma.mailRequest.findMany({ where: { providerId } });
    return rows.map(toDomain);
  }

  async save(request: MailRequest): Promise<void> {
    const row = toPersistence(request);
    await this.prisma.mailRequest.upsert({
      where: { idempotencyKey: row.idempotencyKey },
      create: row,
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
}

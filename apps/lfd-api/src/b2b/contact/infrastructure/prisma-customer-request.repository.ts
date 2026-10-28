import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import type { CustomerRequest, CustomerRequestState } from "../domain/customer-request.js";
import type { RequestPhotoRef } from "../domain/customer-request-details.js";
import { CustomerRequestRepository } from "../domain/ports/customer-request.repository.js";
import {
  changeColumnsOf,
  orderColumnsOf,
  PHOTOS_BY_POSITION,
  photosOf,
  toDomain,
} from "./customer-request.mapper.js";
import { emailReplyColumnsOf } from "./email-reply.columns.js";

/**
 * Adaptateur Prisma de l'écriture des demandes — l'agrégat entier, dans UNE
 * unité de travail : la demande, puis ses photos (créées, ou vidées par
 * l'anonymisation). Ce qui ne change jamais après la réception (motif,
 * type, réception) n'est écrit qu'à la création.
 */
@Injectable()
export class PrismaCustomerRequestRepository extends CustomerRequestRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
  ) {
    super();
  }

  async load(id: string): Promise<CustomerRequest | null> {
    const row = await this.prisma.customerRequest.findUnique({
      where: { id },
      include: PHOTOS_BY_POSITION,
    });
    return row === null ? null : toDomain(row);
  }

  async lockForAnswer(id: string): Promise<CustomerRequest | null> {
    // Le verrou d'abord, la lecture ensuite : sous `FOR UPDATE`, une seconde
    // réponse attend la première, puis la lit traitée.
    const locked = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "public"."customer_request"
      WHERE "id" = ${id}
      FOR UPDATE`;
    return locked.length === 0 ? null : this.load(id);
  }

  async receiveOnce(request: CustomerRequest): Promise<boolean> {
    const state = request.toPersistence();
    // `ON CONFLICT DO NOTHING` : un message déjà rangé (même identifiant
    // Resend, index unique) n'écrit rien et rend 0. Une demande neuve n'a pas
    // de photo : la ligne suffit.
    const { count } = await this.prisma.customerRequest.createMany({
      data: [{ ...creationOf(state), ...mutableOf(state) }],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async save(request: CustomerRequest): Promise<void> {
    const state = request.toPersistence();
    const mutable = mutableOf(state);
    await this.uow.run(async () => {
      await this.prisma.customerRequest.upsert({
        where: { id: state.id },
        create: { ...creationOf(state), ...mutable },
        update: mutable,
      });
      for (const photo of photosOf(state.details)) {
        await this.savePhoto(state.id, photo);
      }
    });
  }

  private async savePhoto(requestId: string, photo: RequestPhotoRef): Promise<void> {
    const row = {
      storageKey: photo.storageKey,
      contentType: photo.contentType,
      sizeBytes: photo.sizeBytes,
      purgedAt: photo.purgedAt,
    };
    await this.prisma.customerRequestPhoto.upsert({
      where: { id: photo.id },
      create: {
        id: photo.id,
        requestId,
        position: photo.position,
        createdAt: photo.createdAt,
        ...row,
      },
      update: row,
    });
  }
}

/** Ce qui ne change jamais après la réception : écrit à la création seulement. */
function creationOf(state: CustomerRequestState) {
  return {
    id: state.id,
    kind: state.details.kind,
    reasonId: state.reason.id,
    reasonLabel: state.reason.labelFr,
    priority: state.reason.priority,
    audience: state.audience,
    receivedAt: state.receivedAt,
  };
}

/** Ce que traitement et anonymisation réécrivent. */
function mutableOf(state: CustomerRequestState) {
  return {
    authorName: state.author.name,
    authorEmail: state.author.email,
    authorPhone: state.author.phone,
    body: state.body,
    userId: state.userId,
    companyId: state.companyId,
    ...orderColumnsOf(state.details),
    ...changeWriteOf(state.details),
    ...emailWriteOf(state.details),
    handledAt: state.handling?.at ?? null,
    handledByStaffId: state.handling?.by.staffUserId ?? null,
    handledByName: state.handling?.by.name ?? null,
    anonymizedAt: state.anonymizedAt,
  };
}

/** Les colonnes de la demande de modification, à l'écriture : `DbNull` est l'ABSENCE, pas un `null` JSON. */
function changeWriteOf(details: Parameters<typeof changeColumnsOf>[0]) {
  const columns = changeColumnsOf(details);
  return {
    ...columns,
    changeContent: columns.changeContent === null ? Prisma.DbNull : columns.changeContent,
  };
}

/** Les colonnes de la réponse par e-mail, à l'écriture : `DbNull` est l'ABSENCE, pas un `null` JSON. */
function emailWriteOf(details: Parameters<typeof emailReplyColumnsOf>[0]) {
  const columns = emailReplyColumnsOf(details);
  const { emailAttachments, emailAuthentication } = columns;
  return {
    emailMessageId: columns.emailMessageId,
    emailSubject: columns.emailSubject,
    emailAttachments:
      emailAttachments === null
        ? Prisma.DbNull
        : emailAttachments.map((file) => ({
            filename: file.filename,
            contentType: file.contentType,
            sizeBytes: file.sizeBytes,
          })),
    emailAuthentication:
      emailAuthentication === null
        ? Prisma.DbNull
        : {
            spf: emailAuthentication.spf,
            dkim: emailAuthentication.dkim,
            dmarc: emailAuthentication.dmarc,
            dkimAligned: emailAuthentication.dkimAligned,
          },
  };
}

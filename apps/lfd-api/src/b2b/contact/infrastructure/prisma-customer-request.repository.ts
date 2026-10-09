import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import type { CustomerRequest } from "../domain/customer-request.js";
import { CustomerRequestRepository } from "../domain/ports/customer-request.repository.js";
import {
  orderColumnsOf,
  PHOTOS_BY_POSITION,
  photosOf,
  toDomain,
} from "./customer-request.mapper.js";

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

  async save(request: CustomerRequest): Promise<void> {
    const state = request.toPersistence();
    const mutable = {
      authorName: state.author.name,
      authorEmail: state.author.email,
      authorPhone: state.author.phone,
      body: state.body,
      userId: state.userId,
      companyId: state.companyId,
      ...orderColumnsOf(state.details),
      handledAt: state.handling?.at ?? null,
      handledByStaffId: state.handling?.by.staffUserId ?? null,
      handledByName: state.handling?.by.name ?? null,
      anonymizedAt: state.anonymizedAt,
    };
    await this.uow.run(async () => {
      await this.prisma.customerRequest.upsert({
        where: { id: state.id },
        create: {
          id: state.id,
          kind: state.details.kind,
          reasonId: state.reason.id,
          reasonLabel: state.reason.labelFr,
          priority: state.reason.priority,
          audience: state.audience,
          receivedAt: state.receivedAt,
          ...mutable,
        },
        update: mutable,
      });
      for (const photo of photosOf(state.details)) {
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
            requestId: state.id,
            position: photo.position,
            createdAt: photo.createdAt,
            ...row,
          },
          update: row,
        });
      }
    });
  }
}

import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { LegalEntity } from "../domain/entities/legal-entity.js";
import { LegalEntityRepository } from "../domain/ports/legal-entity.repository.js";
import { toDomain } from "./legal-entity.mapper.js";

/**
 * Adaptateur Prisma du port d'**écriture**.
 *
 * `save` est un `upsert` sur l'identité frappée par la commande, et non un
 * `create`/`update` choisi par le handler : la distinction « neuve ou modifiée »
 * n'existe pas côté domaine — l'agrégat est écrit en entier, tel que
 * `toPersistence()` le rend.
 *
 * Aucune écriture ciblée n'est exposée. Un `setIcs(id, ics)` contournerait
 * l'immuabilité de l'ICS en silence : la règle vivrait dans l'appelant, donc
 * nulle part pour le prochain.
 */
@Injectable()
export class PrismaLegalEntityRepository extends LegalEntityRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<LegalEntity | null> {
    const row = await this.prisma.legalEntity.findUnique({ where: { id } });
    return row === null ? null : toDomain(row);
  }

  async save(entity: LegalEntity): Promise<void> {
    const snapshot = entity.toPersistence();
    const columns = {
      name: snapshot.name,
      legalForm: snapshot.legalForm,
      siren: snapshot.siren,
      rcs: snapshot.rcs,
      vatNumber: snapshot.vatNumber,
      shareCapitalCents: snapshot.shareCapitalCents,
      addressLine1: snapshot.addressLine1,
      addressLine2: snapshot.addressLine2,
      postalCode: snapshot.postalCode,
      city: snapshot.city,
      countryCode: snapshot.countryCode,
      ics: snapshot.ics,
      creditorIban: snapshot.creditorIban,
      preNotificationDays: snapshot.preNotificationDays,
      logoKey: snapshot.logoKey,
      archivedAt: snapshot.archivedAt,
    };
    await this.prisma.legalEntity.upsert({
      where: { id: snapshot.id },
      create: { id: snapshot.id, ...columns },
      update: columns,
    });
  }
}

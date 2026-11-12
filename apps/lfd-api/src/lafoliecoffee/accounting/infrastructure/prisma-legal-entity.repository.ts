import { Injectable } from "@nestjs/common";

import { FieldCipher } from "../../../platform/crypto/field-cipher.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { LegalEntity } from "../domain/entities/legal-entity.js";
import { LegalEntityChangedConcurrentlyError } from "../domain/errors/creditor-account-review-errors.js";
import { LegalEntityRepository } from "../domain/ports/legal-entity.repository.js";
import { LEGAL_ENTITY_ROW_INCLUDE, legalEntityColumns, toDomain } from "./legal-entity.mapper.js";

/**
 * Adaptateur Prisma du port d'**écriture**.
 *
 * `save` écrit l'identité frappée par la commande — mise à jour sous verrou de
 * version, création si la ligne n'existe pas —, et non un `create`/`update`
 * choisi par le handler : la distinction « neuve ou modifiée »
 * n'existe pas côté domaine — l'agrégat est écrit en entier, tel que
 * `toPersistence()` le rend.
 *
 * Aucune écriture ciblée n'est exposée. Un `setIcs(id, ics)` contournerait
 * l'immuabilité de l'ICS en silence : la règle vivrait dans l'appelant, donc
 * nulle part pour le prochain.
 */
@Injectable()
export class PrismaLegalEntityRepository extends LegalEntityRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
  ) {
    super();
  }

  async load(id: string): Promise<LegalEntity | null> {
    const row = await this.prisma.legalEntity.findUnique({
      where: { id },
      include: LEGAL_ENTITY_ROW_INCLUDE,
    });
    return row === null ? null : toDomain(row, this.cipher);
  }

  /**
   * ⚠️ **La liste est EXPLICITE, donc une colonne neuve s'y ajoute à la main.**
   * Un champ posé sur l'agrégat mais absent d'ici s'écrit sans erreur et ne
   * persiste rien : la commande réussit, l'écran annonce, et la relecture rend
   * l'ancienne valeur. C'est arrivé le 2026-09-12 avec les réglages de mandat —
   * le semis disait « posés » sur une colonne restée vide.
   *
   * 🔴 **Le verrou optimiste** (plan `plan-paiement-au-compte-par-virement.md`,
   * T0) : la ligne ne s'écrit que si elle porte encore la version que l'agrégat
   * a lue, et elle passe à la suivante. Sous Postgres, un second écrivain
   * concurrent attend le verrou de ligne, puis relit la condition et ne trouve
   * plus rien : son geste est refusé (409) au lieu d'écraser le premier. Une
   * ligne absente est une entité neuve, créée.
   *
   * @throws {LegalEntityChangedConcurrentlyError} la ligne a changé depuis la lecture.
   */
  async save(entity: LegalEntity): Promise<void> {
    const snapshot = entity.toPersistence();
    const columns = legalEntityColumns(snapshot, this.cipher);
    const next = snapshot.version + 1;
    const updated = await this.prisma.legalEntity.updateMany({
      where: { id: snapshot.id, version: snapshot.version },
      data: { ...columns, version: next },
    });
    if (updated.count === 0) {
      await this.createOrRefuse(snapshot.id, columns, next);
    }
    entity.persistedAsNextVersion();
    await this.saveBankLimits(entity);
  }

  /** Pas de ligne à cette version : neuve, on la crée ; changée, on refuse. */
  private async createOrRefuse(
    id: string,
    columns: ReturnType<typeof legalEntityColumns>,
    version: number,
  ): Promise<void> {
    const existing = await this.prisma.legalEntity.findUnique({
      where: { id },
      select: { id: true },
    });
    if (existing !== null) {
      throw new LegalEntityChangedConcurrentlyError(id);
    }
    await this.prisma.legalEntity.create({ data: { id, ...columns, version } });
  }

  /**
   * Les plafonds de la banque, une ligne par schéma que l'agrégat connaît —
   * vides compris : effacer un plafond est une écriture, pas une suppression.
   * Dans la transaction de l'appelant (même client Prisma, CLS).
   */
  private async saveBankLimits(entity: LegalEntity): Promise<void> {
    for (const { scheme, ...limits } of entity.bankLimitsToPersistence()) {
      await this.prisma.legalEntityBankLimits.upsert({
        where: { legalEntityId_scheme: { legalEntityId: entity.id, scheme } },
        create: { legalEntityId: entity.id, scheme, ...limits },
        update: limits,
      });
    }
  }

  /**
   * `findFirst` plutôt que `count` : la question est « en existe-t-il une ? »,
   * et Postgres s'arrête au premier enregistrement au lieu de parcourir la
   * table. Sur deux lignes l'écart est nul ; c'est la REQUÊTE qui doit dire ce
   * qu'on cherche, sans quoi le prochain lecteur croit qu'un total sert
   * quelque part.
   */
  async hasAnotherActive(exceptId: string): Promise<boolean> {
    const other = await this.prisma.legalEntity.findFirst({
      where: { id: { not: exceptId }, archivedAt: null },
      select: { id: true },
    });
    return other !== null;
  }

  async invoicePrefixHolder(prefix: string, exceptId: string): Promise<string | null> {
    const holder = await this.prisma.legalEntity.findFirst({
      where: { invoicePrefix: prefix, id: { not: exceptId } },
      select: { name: true },
    });
    return holder?.name ?? null;
  }
}

import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { LegalEntity } from "../domain/entities/legal-entity.js";
import { LegalEntityRepository } from "../domain/ports/legal-entity.repository.js";
import { legalEntityColumns, toDomain } from "./legal-entity.mapper.js";

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

  /**
   * ⚠️ **La liste est EXPLICITE, donc une colonne neuve s'y ajoute à la main.**
   * Un champ posé sur l'agrégat mais absent d'ici s'écrit sans erreur et ne
   * persiste rien : la commande réussit, l'écran annonce, et la relecture rend
   * l'ancienne valeur. C'est arrivé le 2026-09-12 avec les réglages de mandat —
   * le semis disait « posés » sur une colonne restée vide.
   *
   * Un `...snapshot` étalé serait plus sûr mais ferait passer `id` et les
   * horodatages dans l'`update` ; la vigilance est le prix de ce choix.
   */
  async save(entity: LegalEntity): Promise<void> {
    const snapshot = entity.toPersistence();
    const columns = legalEntityColumns(snapshot);
    await this.prisma.legalEntity.upsert({
      where: { id: snapshot.id },
      create: { id: snapshot.id, ...columns },
      update: columns,
    });
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
}

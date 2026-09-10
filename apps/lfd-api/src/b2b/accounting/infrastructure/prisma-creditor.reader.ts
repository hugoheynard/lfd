import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { CreditorSnapshot } from "../domain/creditor-snapshot.js";
import { CreditorReader } from "../domain/ports/creditor.reader.js";
import { toDomain } from "./legal-entity.mapper.js";

/**
 * Adaptateur Prisma de l'émetteur figé.
 *
 * Deux issues à distinguer, et l'adaptateur n'en tranche qu'une : entité
 * **inconnue** ⇒ `null` (l'identifiant est faux, c'est un bug d'appelant) ;
 * entité connue mais inutilisable ⇒ `EntityCannotCollectError`, levée par
 * l'agrégat (la fiche est à compléter, c'est un geste humain). Les rendre
 * identiques enverrait chercher une panne au mauvais endroit.
 */
@Injectable()
export class PrismaCreditorReader extends CreditorReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async snapshot(legalEntityId: string): Promise<CreditorSnapshot | null> {
    const row = await this.prisma.legalEntity.findUnique({ where: { id: legalEntityId } });
    return row === null ? null : toDomain(row).creditorSnapshot();
  }
}

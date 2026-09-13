import { Injectable } from "@nestjs/common";

import { FieldCipher } from "../../../platform/crypto/field-cipher.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { CreditorSnapshot } from "../domain/creditor-snapshot.js";
import { SeveralIssuersError } from "../domain/errors/accounting-errors.js";
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
  ) {
    super();
  }

  async snapshot(legalEntityId: string): Promise<CreditorSnapshot | null> {
    const row = await this.prisma.legalEntity.findUnique({ where: { id: legalEntityId } });
    return row === null ? null : toDomain(row, this.cipher).creditorSnapshot();
  }

  async soleIssuer(): Promise<CreditorSnapshot | null> {
    // DEUX lignes lues, jamais une seule : `take: 1` rendrait toujours un
    // résultat et l'ambiguïté serait indétectable. C'est la deuxième ligne qui
    // porte toute l'information.
    const rows = await this.prisma.legalEntity.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: "asc" },
      take: 2,
    });
    if (rows.length === 0) {
      return null;
    }
    if (rows.length > 1) {
      throw new SeveralIssuersError(rows.length);
    }
    return toDomain(rows[0]!, this.cipher).creditorSnapshot();
  }
}

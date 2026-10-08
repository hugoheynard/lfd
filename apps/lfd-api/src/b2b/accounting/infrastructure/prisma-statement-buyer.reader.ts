import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { StatementBuyer } from "../domain/entities/billing-statement.js";
import { StatementBuyerReader } from "../domain/ports/statement-buyer.reader.js";

/**
 * L'identité légale des payeurs, lue sur leur fiche (`companies`) et leur
 * adresse de facturation (`addresses`, `kind = billing`) — deux tables du
 * même bloc `b2b`.
 *
 * L'adresse retenue est celle **par défaut** parmi les adresses de
 * facturation non archivées, à défaut la plus ancienne ; aucune → vide,
 * jamais l'adresse de livraison à sa place.
 */
@Injectable()
export class PrismaStatementBuyerReader extends StatementBuyerReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async buyersOf(companyIds: readonly string[]): Promise<ReadonlyMap<string, StatementBuyer>> {
    const rows = await this.prisma.company.findMany({
      where: { id: { in: [...companyIds] } },
      select: {
        id: true,
        raisonSociale: true,
        formeJuridique: true,
        siret: true,
        siren: true,
        vatNumber: true,
        addresses: {
          where: { kind: "billing", archivedAt: null },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          take: 1,
          select: { ligne1: true, ligne2: true, codePostal: true, ville: true, pays: true },
        },
      },
    });
    return new Map(
      rows.map((row): [string, StatementBuyer] => {
        const address = row.addresses[0];
        return [
          row.id,
          {
            companyId: row.id,
            name: row.raisonSociale,
            legalForm: row.formeJuridique,
            siret: row.siret,
            siren: row.siren,
            vatNumber: row.vatNumber,
            billingAddressLines:
              address === undefined
                ? []
                : [
                    address.ligne1,
                    address.ligne2,
                    `${address.codePostal} ${address.ville}`,
                    address.pays,
                  ]
                    .map((part) => part.trim())
                    .filter((part) => part !== ""),
          },
        ];
      }),
    );
  }
}

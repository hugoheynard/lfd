import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CompanyNamer, type CompanyIdentity } from "../domain/ports/company-namer.js";

/**
 * Lit l'enseigne et la raison sociale d'une société — pour les **figer** dans
 * un fait du journal, ou pour **nommer** les lignes d'une projection.
 *
 * C'est l'appelant qui choisit : le port rend l'état courant, rien de plus.
 * `OnOrderPlaced` le grave dans le payload ; le tunnel d'activation le relit à
 * chaque passe (cf. le JSDoc du port).
 */
@Injectable()
export class PrismaCompanyNamer extends CompanyNamer {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async nameOf(companyId: string): Promise<CompanyIdentity | null> {
    const row = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { enseigne: true, raisonSociale: true },
    });
    if (row === null) {
      return null;
    }
    return identityOf(row);
  }

  async namesOf(companyIds: readonly string[]): Promise<ReadonlyMap<string, CompanyIdentity>> {
    // Un `in: []` rendrait zéro ligne, mais paierait quand même l'aller-retour :
    // une projection sur un journal vide n'a rien à demander.
    if (companyIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.company.findMany({
      where: { id: { in: [...new Set(companyIds)] } },
      select: { id: true, enseigne: true, raisonSociale: true },
    });
    return new Map(rows.map((row) => [row.id, identityOf(row)]));
  }
}

/**
 * L'enseigne est facultative en base ; sans elle, le client se nomme par sa
 * raison sociale plutôt que par une chaîne vide.
 */
function identityOf(row: { enseigne: string; raisonSociale: string }): CompanyIdentity {
  return {
    enseigne: row.enseigne === "" ? row.raisonSociale : row.enseigne,
    raisonSociale: row.raisonSociale,
  };
}

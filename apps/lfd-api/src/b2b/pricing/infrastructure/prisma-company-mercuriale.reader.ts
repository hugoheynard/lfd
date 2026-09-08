import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CompanyMercurialeReader } from "../domain/ports/company-mercuriale.reader.js";
import type { CompanyMercuriale } from "../domain/entities/company-mercuriale.js";
import { mercurialeFromRow } from "./mercuriale-rows.js";

/**
 * **La mercuriale vivante d'un client**, lue en une requête.
 *
 * La clause dit exactement les trois choses que la contrainte d'exclusion
 * garantit : cette société, non close, et dont la fenêtre couvre l'instant. Les
 * bornes suivent la convention du contexte — basse **incluse**, haute
 * **exclue** — donc une mercuriale qui se ferme à l'instant lu est déjà finie.
 *
 * ⚠️ Une mercuriale **suspendue** est rendue quand même. `applies` lit
 * `suspendedFrom` et décide de ne pas l'appliquer ; filtrer ici dupliquerait
 * cette décision dans une clause SQL, et les deux divergeraient au premier
 * changement.
 */
@Injectable()
export class PrismaCompanyMercurialeReader extends CompanyMercurialeReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async liveFor(companyId: string | null, at: Date): Promise<CompanyMercuriale | null> {
    if (companyId === null) {
      // Un visiteur sans société n'a pas de tarif négocié : pas de requête.
      return null;
    }
    const row = await this.prisma.companyMercuriale.findFirst({
      where: {
        companyId,
        archivedAt: null,
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
      },
    });
    return row === null ? null : mercurialeFromRow(row);
  }
}

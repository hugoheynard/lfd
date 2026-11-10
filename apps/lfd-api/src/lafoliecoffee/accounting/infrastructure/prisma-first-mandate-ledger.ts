import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { FirstMandateLedger } from "../domain/ports/first-mandate-ledger.js";

/**
 * Adaptateur Prisma du verrou du créancier imprimé.
 *
 * `updateMany` et non `update` : le filtre `firstMandateIssuedAt: null` fait de
 * la base le seul juge du « premier ». Un verrou déjà posé ou une entité inconnue
 * ne matchent aucune ligne, et l'appel est un no-op — pas une erreur.
 *
 * `PrismaService` suit la transaction ambiante : appelé dans l'unité de travail
 * de la frappe, il en partage le sort.
 */
@Injectable()
export class PrismaFirstMandateLedger extends FirstMandateLedger {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async note(creditorId: string, at: Date): Promise<void> {
    await this.prisma.legalEntity.updateMany({
      where: { id: creditorId, firstMandateIssuedAt: null },
      data: { firstMandateIssuedAt: at },
    });
  }
}

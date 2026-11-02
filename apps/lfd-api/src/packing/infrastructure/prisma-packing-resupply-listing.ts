import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  PackingResupplyListing,
  type ResupplyToDraw,
} from "../domain/ports/packing-resupply-listing.js";

/**
 * L'adaptateur Prisma de la liste des fiches de réassort. Il tourne dans
 * l'unité de travail que la garde du relais ouvre pour le fait.
 *
 * 🔴 **Le retrait est un STATUT, plus un effacement** (2026-11-02). La fiche
 * est un agrégat (`PackingResupply`, verrouillé et clos au poste) que trois
 * lecteurs relisent : le poste (`PrismaPackingResupplyBoardReader`),
 * l'avancement du colisage (`PrismaDayPackingProgressReader`) et la réception
 * au point (`PrismaPackedResuppliesReader`) — vérifié le 2026-11-02. Une
 * fiche retirée porte `withdrawn_at` ; le dépôt et le poste l'écartent, et les
 * deux autres ne lisent que des fiches entamées ou closes, ce qu'une fiche
 * retirée n'est jamais (CHECK `packing_resupply_withdrawn_untouched`, et
 * aucune ligne emballée : déclencheurs `packing_resupply_withdrawn_unpacked`).
 *
 * ⚠️ La liste des COMMANDES (`PrismaPackingListWithdrawal`) efface encore les
 * siennes, sous verrou depuis le 2026-11-02 : sa seule colonne de statut est
 * la pierre tombale de l'annulation (voir son JSDoc).
 */
@Injectable()
export class PrismaPackingResupplyListing extends PackingResupplyListing {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async draw(resupply: ResupplyToDraw): Promise<void> {
    const key = { serviceDay: resupply.serviceDay, resupplyId: resupply.resupplyId };
    const header = {
      siteId: resupply.siteId,
      siteLabel: resupply.siteLabel,
      name: resupply.name,
      kind: resupply.kind,
      drawnAt: resupply.drawnAt,
    };
    // Une fiche retirée par une réouverture est rétablie par le nouvel arrêt,
    // son en-tête refait comme l'ancien effacement le refaisait.
    await this.prisma.packingResupply.updateMany({
      where: { ...key, withdrawnAt: { not: null } },
      data: { ...header, withdrawnAt: null },
    });
    await this.prisma.packingResupply.createMany({
      data: [{ ...key, ...header }],
      skipDuplicates: true,
    });
    await this.prisma.packingResupplyLine.createMany({
      // Colonne par colonne : un champ ajouté aux lignes du fait n'atteint
      // pas Prisma par un étalement, qui refuserait l'écriture. Une fiche
      // rétablie garde ses lignes : un réassort envoyé ne change plus de
      // lignes (`SiteResupply.assertDraft`, vérifié le 2026-11-02).
      data: resupply.lines.map((line) => ({
        ...key,
        sku: line.sku,
        productName: line.productName,
        quantity: line.quantity,
        saleUnit: line.saleUnit,
      })),
      skipDuplicates: true,
    });
  }

  async withdrawUntouched(
    serviceDay: string,
    resupplyIds: readonly string[],
    at: Date,
  ): Promise<number> {
    if (resupplyIds.length === 0) {
      return 0;
    }
    const { count } = await this.prisma.packingResupply.updateMany({
      where: {
        serviceDay,
        resupplyId: { in: [...resupplyIds] },
        kind: "evening",
        closedAt: null,
        withdrawnAt: null,
        lines: { none: { packed: { not: null } } },
      },
      data: { withdrawnAt: at },
    });
    return count;
  }
}

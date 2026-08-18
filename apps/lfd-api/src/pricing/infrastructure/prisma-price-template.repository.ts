import { Injectable } from "@nestjs/common";

import { Prisma } from "../../infra/database/client/client.js";
import { PrismaService } from "../../infra/database/prisma.service.js";
import { PriceTemplate } from "../domain/entities/price-template.js";
import { PriceTemplateRepository } from "../domain/ports/price-template.repository.js";
import { templateStateFromRow } from "./price-template-rows.js";

@Injectable()
export class PrismaPriceTemplateRepository extends PriceTemplateRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Un `upsert` : composer et réviser écrivent la **grille entière**, jamais un
   * palier. C'est la même raison qui a mis les lignes en JSON — une grille
   * s'écrit d'un bloc, et une écriture partielle serait posée chez un client
   * sans que personne ne la voie incomplète.
   */
  async save(template: PriceTemplate): Promise<void> {
    const state = template.toPersistence();
    // Structure littérale plutôt que le type du domaine : Prisma exige une
    // valeur JSON, et un type figé (`readonly`) n'en est pas une à ses yeux.
    const lines: Prisma.InputJsonValue = state.lines.map((line) => ({
      sku: line.sku,
      tiers: line.tiers.map((tier) => ({
        minQuantity: tier.minQuantity,
        unitPriceCents: tier.unitPriceCents,
      })),
      plannedVolume: line.plannedVolume,
    }));
    await this.prisma.priceTemplate.upsert({
      where: { id: state.id },
      create: {
        id: state.id,
        kind: state.kind,
        label: state.label,
        lines,
        createdBy: state.createdBy,
      },
      update: {
        kind: state.kind,
        label: state.label,
        lines,
        archivedAt: state.archivedAt,
      },
    });
  }

  async load(id: string): Promise<PriceTemplate | null> {
    const row = await this.prisma.priceTemplate.findUnique({ where: { id } });
    return row === null ? null : PriceTemplate.reconstitute(templateStateFromRow(row));
  }
}

import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import {
  OptionGroupOffers,
  type OptionGroupOffer,
} from "../domain/ports/option-group-offers.reader.js";
import { optionAudience } from "../domain/value-objects/option-choice.js";

/**
 * La lecture publiée des groupes : une requête pour tous les groupes visés,
 * leurs choix en service dans l'ordre. Le client est routé vers la
 * transaction ambiante.
 */
@Injectable()
export class PrismaOptionGroupOffers extends OptionGroupOffers {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async describe(ids: readonly string[]): Promise<readonly OptionGroupOffer[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.optionGroup.findMany({
      where: { id: { in: [...ids] } },
      include: { choices: { where: { archivedAt: null }, orderBy: { position: "asc" } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      archived: row.archivedAt !== null,
      choices: row.choices.map((choice) => ({
        key: choice.key,
        label: choice.label,
        audience: optionAudience(choice.audience),
      })),
    }));
  }
}

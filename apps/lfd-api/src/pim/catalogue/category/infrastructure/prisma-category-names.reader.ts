import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { CategoryNamesReader } from "../domain/ports/category-names.reader.js";

/** Un `findMany` sur les identifiants demandés. */
@Injectable()
export class PrismaCategoryNamesReader extends CategoryNamesReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async frenchNamesOf(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const rows = await this.prisma.category.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, frenchName(row.name)]));
  }
}

/**
 * La colonne est un `jsonb` : on la **lit défensivement** plutôt que de la
 * caster, et une valeur illisible rend un nom vide.
 */
function frenchName(value: unknown): string {
  if (typeof value === "object" && value !== null && "fr" in value) {
    const french: unknown = Reflect.get(value, "fr");
    return typeof french === "string" ? french : "";
  }
  return "";
}

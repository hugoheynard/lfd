import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { Category, type CategorySnapshot } from "../domain/entities/category.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import {
  localizedColumn,
  readLocalizedColumn,
  readSalesChannelsColumn,
  salesChannelsColumn,
} from "../../shared/infrastructure/json-readers.js";

interface CategoryRow {
  id: string;
  name: unknown;
  slug: unknown;
  parentId: string | null;
  position: number;
  isArchived: boolean;
  channelPreset: unknown;
  emporterTvaId: string | null;
  surPlaceTvaId: string | null;
}

function toCategory(row: CategoryRow): Category {
  return Category.reconstitute({
    id: row.id,
    name: readLocalizedColumn(row.name, "category.name"),
    slug: readLocalizedColumn(row.slug, "category.slug"),
    parentId: row.parentId,
    position: row.position,
    isArchived: row.isArchived,
    channelPreset: readSalesChannelsColumn(row.channelPreset, "category.channelPreset"),
    emporterTvaId: row.emporterTvaId,
    surPlaceTvaId: row.surPlaceTvaId,
  });
}

/** Les colonnes que l'agrégat possède — l'id n'en est pas une, il identifie. */
function toColumns(snapshot: CategorySnapshot) {
  return {
    name: localizedColumn(snapshot.name),
    slug: localizedColumn(snapshot.slug),
    parentId: snapshot.parentId,
    position: snapshot.position,
    isArchived: snapshot.isArchived,
    channelPreset: salesChannelsColumn(snapshot.channelPreset),
    emporterTvaId: snapshot.emporterTvaId,
    surPlaceTvaId: snapshot.surPlaceTvaId,
  };
}

@Injectable()
export class PrismaCategoryRepository extends CategoryRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async findById(id: string): Promise<Category | null> {
    const row = await this.prisma.category.findUnique({ where: { id } });
    return row === null ? null : toCategory(row);
  }

  async listAll(): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({ orderBy: [{ position: "asc" }] });
    return rows.map(toCategory);
  }

  async add(category: Category): Promise<void> {
    const snapshot = category.snapshot();
    await this.prisma.category.create({ data: { id: snapshot.id, ...toColumns(snapshot) } });
  }

  async save(category: Category): Promise<void> {
    const snapshot = category.snapshot();
    await this.prisma.category.update({
      where: { id: snapshot.id },
      data: toColumns(snapshot),
    });
  }

  /**
   * Une seule transaction : une fratrie à moitié renumérotée porterait des
   * rangs en double, et l'ordre affiché deviendrait celui de l'insertion.
   */
  async saveAll(categories: readonly Category[]): Promise<void> {
    if (categories.length === 0) {
      return;
    }
    await this.prisma.$transaction(
      categories.map((category) => {
        const snapshot = category.snapshot();
        return this.prisma.category.update({
          where: { id: snapshot.id },
          data: toColumns(snapshot),
        });
      }),
    );
  }

  async countActiveProducts(id: string): Promise<number> {
    return this.prisma.product.count({
      where: { categoryId: id, status: { not: "archived" } },
    });
  }

  async nextPosition(parentId: string | null): Promise<number> {
    const last = await this.prisma.category.findFirst({
      where: { parentId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return last === null ? 0 : last.position + 1;
  }
}

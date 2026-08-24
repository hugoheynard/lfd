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
  contextVat: readonly { vatRateId: string; context: { key: string } }[];
}

/** Les taux viennent de la jointure — les trois colonnes n'existent plus. */
const CATEGORY_WITH_VAT = {
  contextVat: { select: { vatRateId: true, context: { select: { key: true } } } },
} as const;

function toCategory(row: CategoryRow): Category {
  const tvaByContext: Record<string, string> = {};
  for (const line of row.contextVat) {
    tvaByContext[line.context.key] = line.vatRateId;
  }
  return Category.reconstitute({
    id: row.id,
    name: readLocalizedColumn(row.name, "category.name"),
    slug: readLocalizedColumn(row.slug, "category.slug"),
    parentId: row.parentId,
    position: row.position,
    isArchived: row.isArchived,
    channelPreset: readSalesChannelsColumn(row.channelPreset, "category.channelPreset"),
    tvaByContext,
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
  };
}

@Injectable()
export class PrismaCategoryRepository extends CategoryRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async findById(id: string): Promise<Category | null> {
    const row = await this.prisma.category.findUnique({
      where: { id },
      include: CATEGORY_WITH_VAT,
    });
    return row === null ? null : toCategory(row);
  }

  /** Filtre sur le chemin `fr` de la colonne `jsonb` — pas de lecture en mémoire. */
  async findBySlugFr(slugFr: string): Promise<Category | null> {
    const row = await this.prisma.category.findFirst({
      where: { slug: { path: ["fr"], equals: slugFr } },
      include: CATEGORY_WITH_VAT,
    });
    return row === null ? null : toCategory(row);
  }

  async listChildren(parentId: string | null): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({
      where: { parentId },
      orderBy: [{ position: "asc" }],
      include: CATEGORY_WITH_VAT,
    });
    return rows.map(toCategory);
  }

  async listAll(): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ position: "asc" }],
      include: CATEGORY_WITH_VAT,
    });
    return rows.map(toCategory);
  }

  async add(category: Category): Promise<void> {
    const snapshot = category.snapshot();
    await this.prisma.$transaction([
      this.prisma.category.create({ data: { id: snapshot.id, ...toColumns(snapshot) } }),
      ...this.tvaOperations(snapshot),
    ]);
  }

  async save(category: Category): Promise<void> {
    const snapshot = category.snapshot();
    await this.prisma.$transaction([
      this.prisma.category.update({ where: { id: snapshot.id }, data: toColumns(snapshot) }),
      ...this.tvaOperations(snapshot),
    ]);
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
      categories.flatMap((category) => {
        const snapshot = category.snapshot();
        return [
          this.prisma.category.update({
            where: { id: snapshot.id },
            data: toColumns(snapshot),
          }),
          ...this.tvaOperations(snapshot),
        ];
      }),
    );
  }

  /**
   * Remplace les taux d'une famille : on efface, puis on réécrit.
   *
   * Un `upsert` par contexte laisserait vivre la ligne d'un contexte qu'on
   * vient de retirer — et « plus de taux » ressemblerait à « taux inchangé ».
   * Ces opérations partent dans la MÊME transaction que la famille : une
   * catégorie enregistrée sans ses taux serait une famille qui ne facture plus.
   *
   * Le lien entre clé de contexte et identifiant passe par une sous-requête
   * (`connect` par `key`) : le dépôt n'a pas à charger le registre, et une clé
   * inconnue casse l'écriture au lieu de créer une ligne orpheline. L'agrégat,
   * lui, l'a déjà refusée — c'est la seconde barrière, pas la première.
   */
  private tvaOperations(snapshot: CategorySnapshot) {
    return [
      this.prisma.categoryContextVat.deleteMany({ where: { categoryId: snapshot.id } }),
      ...Object.entries(snapshot.tvaByContext).map(([contextKey, vatRateId]) =>
        this.prisma.categoryContextVat.create({
          data: {
            category: { connect: { id: snapshot.id } },
            context: { connect: { key: contextKey } },
            vatRate: { connect: { id: vatRateId } },
          },
        }),
      ),
    ];
  }

  async countActiveChildren(parentId: string): Promise<number> {
    return this.prisma.category.count({ where: { parentId, isArchived: false } });
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

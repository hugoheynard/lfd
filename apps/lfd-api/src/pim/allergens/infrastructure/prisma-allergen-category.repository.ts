import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { isUniqueViolation } from "../../catalogue/shared/infrastructure/json-readers.js";
import type { AllergenCategory } from "../domain/entities/allergen-category.js";
import { AllergenCategoryKeyTakenError } from "../domain/errors/allergen-errors.js";
import { AllergenCategoryRepository } from "../domain/ports/allergen-category.repository.js";
import { categoryColumns, toCategory } from "./allergen-rows.js";

/**
 * Le dépôt d'écriture des catégories, sur la base du référentiel.
 *
 * Il ne connaît que l'agrégat : pas de `setPosition`, pas de `markArchived`.
 * L'état entier part par {@link save}, ce qui laisse à l'agrégat le refus d'une
 * atteinte au droit — et au trigger `allergen_category_official_lock` le dernier
 * mot, quel que soit le chemin d'écriture.
 */
@Injectable()
export class PrismaAllergenCategoryRepository extends AllergenCategoryRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async findById(id: string): Promise<AllergenCategory | null> {
    const row = await this.prisma.allergenCategory.findUnique({ where: { id } });
    return row === null ? null : toCategory(row);
  }

  async findByKey(key: string): Promise<AllergenCategory | null> {
    const row = await this.prisma.allergenCategory.findUnique({ where: { key } });
    return row === null ? null : toCategory(row);
  }

  async add(category: AllergenCategory): Promise<void> {
    const columns = categoryColumns(category);
    await this.guardKey(columns.key, () =>
      this.prisma.allergenCategory.create({ data: { id: category.id, ...columns } }),
    );
  }

  async save(category: AllergenCategory): Promise<void> {
    const columns = categoryColumns(category);
    await this.guardKey(columns.key, () =>
      this.prisma.allergenCategory.update({ where: { id: category.id }, data: columns }),
    );
  }

  /**
   * Le **dernier mot** sur l'unicité de la clé.
   *
   * Le handler regarde d'abord si elle est libre, mais entre ce regard et
   * l'écriture il y a un intervalle : deux onglets qui ouvrent
   * « fruits-coque-exotiques » en même temps passent tous les deux. Sans ce
   * filet, le second recevait une erreur Prisma brute au lieu de la phrase qui
   * explique.
   */
  private async guardKey<T>(key: string, write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AllergenCategoryKeyTakenError(key);
      }
      throw error;
    }
  }
}

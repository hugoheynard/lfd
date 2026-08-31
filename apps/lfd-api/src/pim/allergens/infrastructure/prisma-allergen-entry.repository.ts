import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { isUniqueViolation } from "../../catalogue/shared/infrastructure/json-readers.js";
import type { AllergenEntry } from "../domain/entities/allergen-entry.js";
import { AllergenCodeTakenError } from "../domain/errors/allergen-errors.js";
import { AllergenEntryRepository } from "../domain/ports/allergen-entry.repository.js";
import { entryColumns, toEntry } from "./allergen-rows.js";

/**
 * Le dépôt d'écriture des entrées. Même partage que pour les catégories :
 * l'agrégat entre et sort entier, parce que c'est lui qui porte le verrou
 * `official` et l'archivage.
 */
@Injectable()
export class PrismaAllergenEntryRepository extends AllergenEntryRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async findById(id: string): Promise<AllergenEntry | null> {
    const row = await this.prisma.allergenEntry.findUnique({ where: { id } });
    return row === null ? null : toEntry(row);
  }

  async findByCode(code: string): Promise<AllergenEntry | null> {
    const row = await this.prisma.allergenEntry.findUnique({ where: { code } });
    return row === null ? null : toEntry(row);
  }

  async add(entry: AllergenEntry): Promise<void> {
    const columns = entryColumns(entry);
    await this.guardCode(columns.code, () =>
      this.prisma.allergenEntry.create({ data: { id: entry.id, ...columns } }),
    );
  }

  async save(entry: AllergenEntry): Promise<void> {
    const columns = entryColumns(entry);
    await this.guardCode(columns.code, () =>
      this.prisma.allergenEntry.update({ where: { id: entry.id }, data: columns }),
    );
  }

  /** Le dernier mot sur l'unicité du code — cf. le jumeau côté catégories. */
  private async guardCode<T>(code: string, write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AllergenCodeTakenError(code);
      }
      throw error;
    }
  }
}

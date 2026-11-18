import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { localizedColumn, readLocalizedColumn } from "../../../shared/json-readers.js";
import { AppellationAggregate } from "../domain/entities/appellation.entity.js";
import { AppellationCodeTakenError } from "../domain/errors/ingredient-errors.js";
import {
  AppellationRepository,
  type AppellationRecord,
} from "../domain/ports/appellation.repository.js";
import { isUniqueViolation } from "./prisma-violations.js";

interface AppellationRow {
  readonly id: string;
  readonly code: string;
  readonly label: unknown;
  readonly scheme: string;
  readonly active: boolean;
  readonly archivedAt: Date | null;
}

function toAggregate(row: AppellationRow): AppellationAggregate {
  return AppellationAggregate.rehydrate({
    id: row.id,
    code: row.code,
    label: readLocalizedColumn(row.label, "appellation.label"),
    scheme: row.scheme,
    active: row.active,
    archivedAt: row.archivedAt,
  });
}

@Injectable()
export class PrismaAppellationRepository extends AppellationRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  /**
   * Toutes, avec le nombre d'ingrédients qui les citent.
   *
   * Le compte vient d'un `_count` de relation plutôt que d'un chargement des
   * ingrédients : l'écran n'a besoin que du nombre, et charger la relation
   * ferait voyager tout le référentiel pour peupler une colonne.
   */
  async list(): Promise<readonly AppellationRecord[]> {
    const rows = await this.prisma.appellation.findMany({
      orderBy: { code: "asc" },
      include: { _count: { select: { ingredients: true } } },
    });
    return rows.map((row) => ({
      ...toAggregate(row).snapshot(),
      usedBy: row._count.ingredients,
    }));
  }

  async findByCode(code: string): Promise<AppellationAggregate | null> {
    const row = await this.prisma.appellation.findUnique({ where: { code } });
    return row === null ? null : toAggregate(row);
  }

  async add(appellation: AppellationAggregate): Promise<void> {
    const { label, ...rest } = appellation.snapshot();
    await this.guardCode(rest.code, () =>
      this.prisma.appellation.create({ data: { ...rest, label: localizedColumn(label) } }),
    );
  }

  async save(appellation: AppellationAggregate): Promise<void> {
    // `archived_at` n'est écrit que par `saveArchival` : une édition chargée
    // avant une archive ne doit pas la défaire.
    const { id, code, label, archivedAt, ...columns } = appellation.snapshot();
    void id;
    void archivedAt;
    await this.guardCode(code, () =>
      this.prisma.appellation.update({
        where: { code },
        data: { ...columns, label: localizedColumn(label) },
      }),
    );
  }

  async saveArchival(appellation: AppellationAggregate): Promise<void> {
    const { code, archivedAt } = appellation.snapshot();
    await this.prisma.appellation.update({ where: { code }, data: { archivedAt } });
  }

  /**
   * Le dernier mot sur l'unicité du code. Le handler regarde d'abord s'il est
   * libre, mais entre ce regard et l'écriture il y a un intervalle — deux
   * onglets qui créent « aop-beaufort » en même temps passent tous les deux.
   */
  private async guardCode<T>(code: string, write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppellationCodeTakenError(code);
      }
      throw error;
    }
  }
}

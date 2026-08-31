import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import {
  localizedColumn,
  readLocalizedColumn,
} from "../../catalogue/shared/infrastructure/json-readers.js";
import { AppellationAggregate } from "../domain/entities/appellation.entity.js";
import {
  AppellationCodeTakenError,
  AppellationInUseError,
} from "../domain/errors/ingredient-errors.js";
import {
  AppellationRepository,
  type AppellationRecord,
} from "../domain/ports/appellation.repository.js";
import { isForeignKeyViolation, isUniqueViolation } from "./prisma-violations.js";

interface AppellationRow {
  readonly id: string;
  readonly code: string;
  readonly label: unknown;
  readonly scheme: string;
  readonly active: boolean;
}

function toAggregate(row: AppellationRow): AppellationAggregate {
  return AppellationAggregate.rehydrate({
    id: row.id,
    code: row.code,
    label: readLocalizedColumn(row.label, "appellation.label"),
    scheme: row.scheme,
    active: row.active,
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

  async idOfCode(code: string): Promise<string | null> {
    const row = await this.prisma.appellation.findUnique({
      where: { code },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async add(appellation: AppellationAggregate): Promise<void> {
    const { label, ...rest } = appellation.snapshot();
    await this.guardCode(rest.code, () =>
      this.prisma.appellation.create({ data: { ...rest, label: localizedColumn(label) } }),
    );
  }

  async save(appellation: AppellationAggregate): Promise<void> {
    const { id, code, label, ...columns } = appellation.snapshot();
    void id;
    await this.guardCode(code, () =>
      this.prisma.appellation.update({
        where: { code },
        data: { ...columns, label: localizedColumn(label) },
      }),
    );
  }

  /**
   * Le **dernier mot** sur « une appellation citée ne disparaît pas ».
   *
   * La clé étrangère tranche, et non un compte préalable : entre le compte et
   * la suppression, un ingrédient peut se mettre à la citer. Et on ne recompte
   * PAS après l'échec — la transaction du handler est déjà avortée à ce
   * moment-là, toute requête suivante échouerait à son tour.
   */
  async remove(code: string): Promise<void> {
    try {
      await this.prisma.appellation.delete({ where: { code } });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new AppellationInUseError(code);
      }
      throw error;
    }
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

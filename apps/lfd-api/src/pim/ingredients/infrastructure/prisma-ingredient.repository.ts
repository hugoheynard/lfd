import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import {
  localizedColumn,
  optionalLocalizedColumn,
  readLocalizedColumn,
} from "../../catalogue/shared/infrastructure/json-readers.js";
import type { LocalizedText } from "@lfd/pim-contracts";

import type { AppellationSnapshot } from "../domain/entities/appellation.entity.js";
import { IngredientAggregate } from "../domain/entities/ingredient.entity.js";
import {
  IngredientInUseError,
  IngredientKeyTakenError,
  IngredientNotFoundError,
} from "../domain/errors/ingredient-errors.js";
import {
  IngredientRepository,
  type IngredientRecord,
} from "../domain/ports/ingredient.repository.js";
import { isForeignKeyViolation, isUniqueViolation } from "./prisma-violations.js";

interface AppellationJoin {
  readonly id: string;
  readonly code: string;
  readonly label: unknown;
  readonly scheme: string;
  readonly active: boolean;
}

interface IngredientRow {
  readonly id: string;
  readonly key: string;
  readonly name: unknown;
  readonly description: unknown;
  readonly origin: string;
  readonly appellationId: string | null;
}

/** Ce que toute lecture d'ingrédient embarque — écrit une fois, lu par trois. */
const WITH_APPELLATION = {
  appellation: true,
  _count: { select: { products: true } },
} as const;

function toAggregate(row: IngredientRow): IngredientAggregate {
  return IngredientAggregate.rehydrate({
    id: row.id,
    key: row.key,
    name: readLocalizedColumn(row.name, "ingredient.name"),
    description: optionalLocalizedColumn(row.description),
    origin: row.origin,
    appellationId: row.appellationId,
  });
}

function toAppellation(row: AppellationJoin | null): AppellationSnapshot | null {
  return row === null
    ? null
    : {
        id: row.id,
        code: row.code,
        label: readLocalizedColumn(row.label, "appellation.label"),
        scheme: row.scheme,
        active: row.active,
      };
}

/**
 * Un champ vidé doit **effacer** la colonne : d'où `Prisma.DbNull` plutôt
 * qu'une clé omise, qui en `update` ne changerait rien. On n'écrit jamais
 * `{ fr: "" }` — le vide n'est pas une valeur.
 */
function optionalColumn(text: LocalizedText | null): Record<string, string> | typeof Prisma.DbNull {
  return text === null ? Prisma.DbNull : localizedColumn(text);
}

function toRecord(
  row: IngredientRow & { appellation: AppellationJoin | null; _count: { products: number } },
): IngredientRecord {
  return {
    ...toAggregate(row).snapshot(),
    appellation: toAppellation(row.appellation),
    usedBy: row._count.products,
  };
}

@Injectable()
export class PrismaIngredientRepository extends IngredientRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async list(): Promise<readonly IngredientRecord[]> {
    const rows = await this.prisma.ingredient.findMany({
      orderBy: { key: "asc" },
      include: WITH_APPELLATION,
    });
    return rows.map(toRecord);
  }

  async findByKey(key: string): Promise<IngredientAggregate | null> {
    const row = await this.prisma.ingredient.findUnique({ where: { key } });
    return row === null ? null : toAggregate(row);
  }

  async add(ingredient: IngredientAggregate): Promise<void> {
    const { name, description, ...rest } = ingredient.snapshot();
    await this.guardKey(rest.key, () =>
      this.prisma.ingredient.create({
        data: {
          ...rest,
          name: localizedColumn(name),
          description: optionalColumn(description),
        },
      }),
    );
  }

  async save(ingredient: IngredientAggregate): Promise<void> {
    const { id, key, name, description, ...columns } = ingredient.snapshot();
    void id;
    await this.guardKey(key, () =>
      this.prisma.ingredient.update({
        where: { key },
        data: {
          ...columns,
          name: localizedColumn(name),
          description: optionalColumn(description),
        },
      }),
    );
  }

  /**
   * Le **dernier mot** sur « un ingrédient cité ne disparaît pas ».
   *
   * Même raisonnement que l'appellation : la clé étrangère tranche, et on ne
   * recompte pas après l'échec — la transaction du handler est déjà avortée.
   */
  async remove(key: string): Promise<void> {
    try {
      await this.prisma.ingredient.delete({ where: { key } });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new IngredientInUseError(key);
      }
      throw error;
    }
  }

  async ofProduct(productId: string): Promise<readonly IngredientRecord[]> {
    const rows = await this.prisma.productIngredient.findMany({
      where: { productId },
      orderBy: { position: "asc" },
      include: { ingredient: { include: WITH_APPELLATION } },
    });
    return rows.map((row) => toRecord(row.ingredient));
  }

  /**
   * Remplace ce qu'une fiche cite, **dans l'ordre reçu**.
   *
   * Table rase puis réécriture, et non un différentiel : l'ordre fait partie de
   * la donnée, et rejouer un différentiel sur des rangs revient à recalculer
   * toute la liste de toute façon. Les deux ordres partent dans la transaction
   * du handler, donc la fiche n'est jamais vue sans ses ingrédients.
   */
  async setOfProduct(productId: string, keys: readonly string[]): Promise<void> {
    // Un ingrédient cité deux fois est une liste, pas deux citations : le
    // doublon est écarté ici plutôt que de heurter la clé primaire, qui
    // rendrait une violation d'unicité là où il n'y a qu'une redite.
    const wanted = [...new Set(keys)];
    const found = await this.prisma.ingredient.findMany({
      where: { key: { in: wanted } },
      select: { id: true, key: true },
    });
    const idOfKey = new Map(found.map((row) => [row.key, row.id]));
    const data = wanted.map((key, position) => {
      const ingredientId = idOfKey.get(key);
      if (ingredientId === undefined) {
        throw new IngredientNotFoundError(key);
      }
      return { productId, ingredientId, position };
    });

    await this.prisma.productIngredient.deleteMany({ where: { productId } });
    if (data.length > 0) {
      await this.prisma.productIngredient.createMany({ data });
    }
  }

  private async guardKey<T>(key: string, write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new IngredientKeyTakenError(key);
      }
      throw error;
    }
  }
}

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
  UnknownIngredientAllergenError,
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

interface AllergenJoin {
  readonly entry: { readonly code: string };
}

interface IngredientRow {
  readonly id: string;
  readonly key: string;
  readonly name: unknown;
  readonly description: unknown;
  readonly origin: string;
  readonly appellationId: string | null;
  readonly allergens: readonly AllergenJoin[];
}

/**
 * Ce que toute lecture d'ingrédient embarque — écrit une fois, lu par trois.
 *
 * Les allergènes en font partie plutôt que d'être chargés à la demande : sans
 * eux, `findByKey` rendrait un agrégat amputé, et le `save()` qui suit
 * effacerait ce que personne n'a touché.
 */
const WITH_APPELLATION = {
  appellation: true,
  allergens: { select: { entry: { select: { code: true } } } },
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
    // L'agrégat range et déduplique : l'ordre des lignes de liaison n'est pas
    // une donnée, et on ne lui en demande donc pas un.
    allergens: row.allergens.map((link) => link.entry.code),
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
    const row = await this.prisma.ingredient.findUnique({
      where: { key },
      include: { allergens: { select: { entry: { select: { code: true } } } } },
    });
    return row === null ? null : toAggregate(row);
  }

  async add(ingredient: IngredientAggregate): Promise<void> {
    const { name, description, allergens, ...rest } = ingredient.snapshot();
    await this.guardKey(rest.key, () =>
      this.prisma.ingredient.create({
        data: {
          ...rest,
          name: localizedColumn(name),
          description: optionalColumn(description),
        },
      }),
    );
    await this.linkAllergens(rest.id, allergens);
  }

  async save(ingredient: IngredientAggregate): Promise<void> {
    const { id, key, name, description, allergens, ...columns } = ingredient.snapshot();
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
    await this.linkAllergens(id, allergens);
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

  /**
   * Aligne les liaisons d'allergènes sur ce que porte l'agrégat.
   *
   * Un **différentiel** et non la table rase de `setOfProduct` : là-bas l'ordre
   * fait partie de la donnée, si bien qu'un différentiel reviendrait à
   * recalculer toute la liste ; ici c'est un ensemble sans ordre, et `save()`
   * est appelé par TOUS les gestes de l'ingrédient — renommer une matière
   * réécrirait sinon ses liaisons à chaque fois, pour rien.
   *
   * La traduction code → identifiant technique vit ici, comme celle des clés
   * d'ingrédients dans `setOfProduct` : le fil et le journal parlent en codes,
   * la base joint par identifiant. Un code absent du référentiel est refusé —
   * le handler l'a déjà vérifié, mais un dépôt ne suppose pas son appelant.
   */
  private async linkAllergens(ingredientId: string, codes: readonly string[]): Promise<void> {
    const [current, entries] = await Promise.all([
      this.prisma.ingredientAllergen.findMany({
        where: { ingredientId },
        select: { entryId: true },
      }),
      codes.length === 0
        ? Promise.resolve([])
        : this.prisma.allergenEntry.findMany({
            where: { code: { in: [...codes] } },
            select: { id: true, code: true },
          }),
    ]);
    const idOfCode = new Map(entries.map((entry) => [entry.code, entry.id]));
    const wanted = new Set(
      codes.map((code) => {
        const entryId = idOfCode.get(code);
        if (entryId === undefined) {
          throw new UnknownIngredientAllergenError(code);
        }
        return entryId;
      }),
    );
    const held = new Set(current.map((link) => link.entryId));
    const dropped = [...held].filter((entryId) => !wanted.has(entryId));
    const added = [...wanted].filter((entryId) => !held.has(entryId));

    if (dropped.length > 0) {
      await this.prisma.ingredientAllergen.deleteMany({
        where: { ingredientId, entryId: { in: dropped } },
      });
    }
    if (added.length > 0) {
      await this.prisma.ingredientAllergen.createMany({
        data: added.map((entryId) => ({ ingredientId, entryId })),
      });
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

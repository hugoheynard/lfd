import { Injectable } from "@nestjs/common";
import {
  orderTimeLimitScopeTypeSchema,
  type OrderTimeLimitScopeType,
  type OrderTimeLimitView,
} from "@lfd/pim-contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { WriteTicket } from "../../journal/pim-journal.js";
import { OrderTimeLimit } from "../domain/entities/order-time-limit.js";
import { OrderTimeLimitNotFoundError } from "../domain/errors/order-time-limit-errors.js";
import { OrderTimeLimitRepository } from "../domain/ports/order-time-limit.repository.js";
import { LimitScope } from "../domain/value-objects/limit-scope.js";

/** Une ligne telle que Prisma la rend. */
interface LimitRow {
  readonly id: string;
  readonly scopeType: string;
  readonly scopeId: string | null;
  readonly daysBefore: number | null;
  readonly time: string | null;
  readonly graceMinutes: number | null;
}

@Injectable()
export class PrismaOrderTimeLimitRepository extends OrderTimeLimitRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Les règles, avec le **nom** de leur cible résolu pour l'affichage.
   *
   * Trois lectures plutôt qu'une jointure : les cibles vivent dans trois tables
   * différentes (famille, produit, déclinaison) et Prisma n'a pas de relation
   * polymorphe. Les noms ne servent qu'à l'écran — une cible disparue rend
   * `null`, et la règle reste visible plutôt que d'être escamotée avec elle.
   */
  async list(): Promise<readonly OrderTimeLimitView[]> {
    const rows = await this.prisma.orderTimeLimit.findMany();
    const labels = await this.labelsFor(rows);
    return rows.flatMap((row) => {
      const view = toView(row, labels);
      return view === null ? [] : [view];
    });
  }

  async findByScope(scope: LimitScope): Promise<OrderTimeLimit | null> {
    const row = await this.prisma.orderTimeLimit.findFirst({
      where: { scopeType: scope.type, scopeId: scope.id },
    });
    return row === null ? null : toDomain(row);
  }

  /**
   * Écrit la règle à son identifiant. `upsert` et non `create`/`update` : le
   * handler a déjà décidé lequel des deux c'était en cherchant la portée, et
   * refaire ce test ici en ferait un second endroit à corriger.
   */
  async save(limit: OrderTimeLimit, _ticket: WriteTicket): Promise<void> {
    const values = {
      daysBefore: limit.daysBefore,
      time: limit.time,
      graceMinutes: limit.graceMinutes,
    };
    await this.prisma.orderTimeLimit.upsert({
      where: { id: limit.id },
      create: { id: limit.id, scopeType: limit.scope.type, scopeId: limit.scope.id, ...values },
      update: values,
    });
  }

  async remove(id: string, _ticket: WriteTicket): Promise<void> {
    const found = await this.prisma.orderTimeLimit.findUnique({
      where: { id },
      select: { id: true },
    });
    if (found === null) {
      throw new OrderTimeLimitNotFoundError(id);
    }
    await this.prisma.orderTimeLimit.delete({ where: { id } });
  }

  /** Les noms des cibles visées, par identifiant — familles, produits, déclinaisons. */
  private async labelsFor(rows: readonly LimitRow[]): Promise<ReadonlyMap<string, string>> {
    const idsOf = (type: OrderTimeLimitScopeType): string[] =>
      rows.flatMap((row) => (row.scopeType === type && row.scopeId !== null ? [row.scopeId] : []));

    const [categories, products, variants] = await Promise.all([
      this.prisma.category.findMany({ where: { id: { in: idsOf("category") } } }),
      this.prisma.product.findMany({
        where: { id: { in: idsOf("product") } },
        select: { id: true, sku: true },
      }),
      this.prisma.productVariant.findMany({
        where: { id: { in: idsOf("variant") } },
        select: { id: true, sku: true },
      }),
    ]);

    const labels = new Map<string, string>();
    for (const category of categories) {
      labels.set(category.id, readName(category.name));
    }
    for (const product of products) {
      labels.set(product.id, product.sku);
    }
    for (const variant of variants) {
      labels.set(variant.id, variant.sku);
    }
    return labels;
  }
}

/**
 * Le nom localisé d'une famille, réduit à quelque chose d'affichable.
 *
 * La colonne est un `jsonb` : on la **lit défensivement** plutôt que de la
 * caster. Une valeur écrite à la main ne doit pas faire tomber l'écran de
 * réglages — elle doit juste ne pas avoir de nom.
 */
function readName(value: unknown): string {
  if (typeof value === "object" && value !== null && "fr" in value) {
    const french: unknown = Reflect.get(value, "fr");
    return typeof french === "string" ? french : "";
  }
  return "";
}

function toView(row: LimitRow, labels: ReadonlyMap<string, string>): OrderTimeLimitView | null {
  const type = toScopeType(row.scopeType);
  if (type === null) {
    return null;
  }
  return {
    id: row.id,
    scope: { type, id: row.scopeId },
    scopeLabel: row.scopeId === null ? null : (labels.get(row.scopeId) ?? null),
    daysBefore: row.daysBefore,
    time: row.time,
    graceMinutes: row.graceMinutes,
  };
}

/**
 * La ligne trouvée par portée : le type vient de la requête, donc il est valide.
 * On le revalide quand même, et l'absurde ne devient pas une règle.
 */
function toDomain(row: LimitRow): OrderTimeLimit | null {
  const type = toScopeType(row.scopeType);
  if (type === null) {
    return null;
  }
  return OrderTimeLimit.reconstitute(row.id, {
    scope: { type, id: row.scopeId },
    daysBefore: row.daysBefore,
    time: row.time,
    graceMinutes: row.graceMinutes,
  });
}

/**
 * La colonne est un `text` libre côté Postgres : on la **valide** au retour
 * plutôt que de la caster.
 *
 * 🔴 Une valeur inconnue rend `null`, et la ligne est **écartée**. Le repli
 * tentant — « prendre `global` » — serait le pire de tous : il appliquerait à
 * TOUT le catalogue une règle écrite pour un article, et il violerait au passage
 * l'invariant de portée (un `global` ne nomme aucune cible), donc il ferait
 * tomber la lecture entière. Une règle illisible ne s'applique à rien.
 */
function toScopeType(value: string): OrderTimeLimitScopeType | null {
  const parsed = orderTimeLimitScopeTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

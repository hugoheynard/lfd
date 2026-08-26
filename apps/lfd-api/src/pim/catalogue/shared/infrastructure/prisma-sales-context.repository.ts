import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { SalesContextAggregate } from "../domain/entities/sales-context.entity.js";
import {
  SalesContextInUseError,
  SalesContextKeyTakenError,
} from "../domain/errors/sales-context-errors.js";
import {
  SalesContextRepository,
  type SalesContextUsage,
} from "../domain/ports/sales-context.repository.js";

interface SalesContextRow {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly handleSuffix: string;
  readonly channelKey: string;
  readonly perLocation: boolean;
  readonly active: boolean;
  readonly shopifyProjected: boolean;
  readonly position: number;
}

function toAggregate(row: SalesContextRow): SalesContextAggregate {
  return SalesContextAggregate.reconstitute({
    id: row.id,
    key: row.key,
    label: row.label,
    handleSuffix: row.handleSuffix,
    channelKey: row.channelKey,
    perLocation: row.perLocation,
    active: row.active,
    shopifyProjected: row.shopifyProjected,
    position: row.position,
  });
}

/** Violation d'unicité Prisma — le `23505` de Postgres. Ici : deux fois la même clé. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

/** Violation de clé étrangère — le `23503`. Ici : un contexte encore cité. */
function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
}

@Injectable()
export class PrismaSalesContextRepository extends SalesContextRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async findByKey(key: string): Promise<SalesContextAggregate | null> {
    const row = await this.prisma.salesContext.findUnique({ where: { key } });
    return row === null ? null : toAggregate(row);
  }

  async findProjectedByHandleSuffix(suffix: string): Promise<SalesContextAggregate | null> {
    const row = await this.prisma.salesContext.findFirst({
      where: { handleSuffix: suffix, shopifyProjected: true },
    });
    return row === null ? null : toAggregate(row);
  }

  async nextPosition(): Promise<number> {
    const last = await this.prisma.salesContext.findFirst({
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return last === null ? 1 : last.position + 1;
  }

  async add(context: SalesContextAggregate): Promise<void> {
    const snapshot = context.snapshot();
    await this.guardKey(snapshot.key, () =>
      this.prisma.salesContext.create({ data: { ...snapshot } }),
    );
  }

  async save(context: SalesContextAggregate): Promise<void> {
    const snapshot = context.snapshot();
    const { id, key, ...columns } = snapshot;
    void id;
    await this.guardKey(key, () =>
      this.prisma.salesContext.update({ where: { key }, data: columns }),
    );
  }

  /**
   * Le **dernier mot** sur « un contexte encore cité ne disparaît pas ».
   *
   * Trois tables le citent par clé étrangère — `location_context`,
   * `category_channel`, `product_channel` — et deux autres par identifiant, les
   * taux. Aucune lecture préalable ne tiendrait : entre le compte et la
   * suppression, une grille peut se mettre à le vendre.
   *
   * **Sans recompter.** La suppression part dans la transaction du handler ;
   * une fois l'ordre en échec, Postgres a avorté la transaction et toute
   * requête suivante échoue à son tour. C'est la leçon du taux de TVA, payée
   * une fois.
   */
  async remove(key: string): Promise<void> {
    try {
      await this.prisma.salesContext.delete({ where: { key } });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new SalesContextInUseError(key);
      }
      throw error;
    }
  }

  /**
   * Ce qui retient chaque contexte — trois comptes, trois `groupBy`.
   *
   * Comptés côté base : charger les grilles pour n'en garder que des nombres
   * ferait voyager tout le catalogue pour peupler une colonne d'écran.
   */
  async usageByKey(): Promise<ReadonlyMap<string, SalesContextUsage>> {
    const [byCategory, byProduct, byLocation, ratedCategory, ratedProduct, contexts] =
      await Promise.all([
        this.prisma.categoryChannel.groupBy({ by: ["contextKey"], _count: { _all: true } }),
        this.prisma.productChannel.groupBy({ by: ["contextKey"], _count: { _all: true } }),
        this.prisma.locationContext.groupBy({ by: ["contextKey"], _count: { _all: true } }),
        this.prisma.categoryContextVat.groupBy({ by: ["contextId"], _count: { _all: true } }),
        this.prisma.productContextVat.groupBy({ by: ["contextId"], _count: { _all: true } }),
        this.prisma.salesContext.findMany({ select: { id: true, key: true } }),
      ]);

    // Les taux joignent par IDENTIFIANT ; tout le reste par clé. On traduit une
    // fois plutôt que de faire porter la traduction à chaque lecteur.
    const keyById = new Map(contexts.map((context) => [context.id, context.key]));
    const usage = new Map<string, { soldBy: number; offeredBy: number; ratedBy: number }>();
    const bump = (key: string | undefined, field: keyof SalesContextUsage, by: number): void => {
      if (key === undefined) {
        return;
      }
      const current = usage.get(key) ?? { soldBy: 0, offeredBy: 0, ratedBy: 0 };
      current[field] += by;
      usage.set(key, current);
    };

    for (const row of [...byCategory, ...byProduct]) {
      bump(row.contextKey, "soldBy", row._count._all);
    }
    for (const row of byLocation) {
      bump(row.contextKey, "offeredBy", row._count._all);
    }
    for (const row of [...ratedCategory, ...ratedProduct]) {
      bump(keyById.get(row.contextId), "ratedBy", row._count._all);
    }
    return usage;
  }

  /**
   * Le dernier mot sur l'unicité de la clé. Le handler regarde d'abord si elle
   * est libre, mais entre ce regard et l'écriture il y a un intervalle — deux
   * onglets qui créent « traiteur » en même temps passent tous deux.
   */
  private async guardKey<T>(key: string, write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new SalesContextKeyTakenError(key);
      }
      throw error;
    }
  }
}

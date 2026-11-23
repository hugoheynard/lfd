import { Injectable } from "@nestjs/common";
import {
  orderTimeLimitScopeTypeSchema,
  type OrderTimeLimitScopeType,
  type OrderTimeLimitView,
} from "@lfd/pim-contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { WriteTicket } from "../../../platform/journal/scoped-journal.js";
import { OrderTimeLimit } from "../domain/entities/order-time-limit.js";
import type { OrderTimeLimitExclusion } from "../domain/entities/order-time-limit-exclusion.js";
import { OrderTimeLimitRepository } from "../domain/ports/order-time-limit.repository.js";
import { LimitTargetLabelsReader } from "../domain/ports/limit-target-labels.reader.js";
import { LimitScope } from "../domain/value-objects/limit-scope.js";

/** Une ligne telle que Prisma la rend. */
interface LimitRow {
  readonly id: string;
  readonly scopeType: string;
  readonly scopeId: string | null;
  readonly daysBefore: number | null;
  readonly time: string | null;
  readonly graceMinutes: number | null;
  readonly staffMayExceed: boolean;
  readonly archivedAt: Date | null;
}

/** Une ligne et ses exclusions — vivantes seulement, ou toutes, selon la lecture. */
interface LimitRowWithExclusions extends LimitRow {
  readonly exclusions: readonly OrderTimeLimitExclusion[];
}

/** Les exclusions vivantes : ce que la vue et le fil portent. */
const LIVE_EXCLUSIONS = { exclusions: { where: { removedAt: null } } } as const;

@Injectable()
export class PrismaOrderTimeLimitRepository extends OrderTimeLimitRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: LimitTargetLabelsReader,
  ) {
    super();
  }

  /**
   * Les règles, avec le **nom** de leur cible résolu pour l'affichage.
   *
   * Les noms viennent du catalogue (`LimitTargetLabelsReader`) : les cibles
   * vivent dans trois tables qui ne sont pas les nôtres. Ils ne servent qu'à
   * l'écran — une cible disparue rend `null`, et la règle reste visible
   * plutôt que d'être escamotée avec elle.
   */
  async list(): Promise<readonly OrderTimeLimitView[]> {
    return this.views(await this.prisma.orderTimeLimit.findMany({ include: LIVE_EXCLUSIONS }));
  }

  /** `archived_at IS NULL` dans la requête : une limite archivée ne s'applique plus. */
  async inForce(): Promise<readonly OrderTimeLimitView[]> {
    return this.views(
      await this.prisma.orderTimeLimit.findMany({
        where: { archivedAt: null },
        include: LIVE_EXCLUSIONS,
      }),
    );
  }

  /** L'agrégat porte ses exclusions vivantes : les retirées ne se modifient plus. */
  async findById(id: string): Promise<OrderTimeLimit | null> {
    const row = await this.prisma.orderTimeLimit.findUnique({
      where: { id },
      include: LIVE_EXCLUSIONS,
    });
    return row === null ? null : toDomain(row);
  }

  async findByScope(scope: LimitScope): Promise<OrderTimeLimit | null> {
    const row = await this.prisma.orderTimeLimit.findFirst({
      where: { scopeType: scope.type, scopeId: scope.id },
      include: LIVE_EXCLUSIONS,
    });
    return row === null ? null : toDomain(row);
  }

  /**
   * Écrit la règle à son identifiant. `upsert` et non `create`/`update` : le
   * handler a déjà décidé lequel des deux c'était en cherchant la portée, et
   * refaire ce test ici en ferait un second endroit à corriger.
   *
   * Les exclusions se comparent à la base : une exclusion que l'agrégat tient
   * et que la base n'a pas s'insère ; une exclusion vivante en base que
   * l'agrégat a retirée reçoit son `removed_at`. Aucune ne s'efface.
   */
  async save(limit: OrderTimeLimit, _ticket: WriteTicket): Promise<void> {
    const values = {
      daysBefore: limit.daysBefore,
      time: limit.time,
      graceMinutes: limit.graceMinutes,
      staffMayExceed: limit.staffMayExceed,
      archivedAt: limit.archivedAt,
    };
    await this.prisma.orderTimeLimit.upsert({
      where: { id: limit.id },
      create: { id: limit.id, scopeType: limit.scope.type, scopeId: limit.scope.id, ...values },
      update: values,
    });
    await this.saveExclusions(limit);
  }

  async saveArchival(limit: OrderTimeLimit, _ticket: WriteTicket): Promise<void> {
    await this.prisma.orderTimeLimit.update({
      where: { id: limit.id },
      data: { archivedAt: limit.archivedAt },
    });
  }

  private async saveExclusions(limit: OrderTimeLimit): Promise<void> {
    const stored = await this.prisma.orderTimeLimitExclusion.findMany({
      where: { limitId: limit.id },
      select: { id: true, removedAt: true },
    });
    const storedById = new Map(stored.map((row) => [row.id, row.removedAt]));
    const added = limit.exclusions.filter((exclusion) => !storedById.has(exclusion.id));
    const removed = limit.exclusions.filter(
      (exclusion) =>
        exclusion.removedAt !== null &&
        storedById.has(exclusion.id) &&
        storedById.get(exclusion.id) === null,
    );
    if (added.length > 0) {
      await this.prisma.orderTimeLimitExclusion.createMany({
        data: added.map((exclusion) => ({
          id: exclusion.id,
          limitId: limit.id,
          productId: exclusion.productId,
          createdAt: exclusion.createdAt,
          removedAt: exclusion.removedAt,
        })),
      });
    }
    for (const exclusion of removed) {
      await this.prisma.orderTimeLimitExclusion.update({
        where: { id: exclusion.id },
        data: { removedAt: exclusion.removedAt },
      });
    }
  }

  private async views(
    rows: readonly LimitRowWithExclusions[],
  ): Promise<readonly OrderTimeLimitView[]> {
    const labels = await this.targets.labelsOf(rows);
    return rows.flatMap((row) => {
      const view = toView(row, labels);
      return view === null ? [] : [view];
    });
  }
}

function toView(
  row: LimitRowWithExclusions,
  labels: ReadonlyMap<string, string>,
): OrderTimeLimitView | null {
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
    staffMayExceed: row.staffMayExceed,
    archived: row.archivedAt !== null,
    excludedProductIds: row.exclusions.map((exclusion) => exclusion.productId),
  };
}

/**
 * La ligne trouvée par portée : le type vient de la requête, donc il est valide.
 * On le revalide quand même, et l'absurde ne devient pas une règle.
 */
function toDomain(row: LimitRowWithExclusions): OrderTimeLimit | null {
  const type = toScopeType(row.scopeType);
  if (type === null) {
    return null;
  }
  return OrderTimeLimit.reconstitute(
    row.id,
    {
      scope: { type, id: row.scopeId },
      daysBefore: row.daysBefore,
      time: row.time,
      graceMinutes: row.graceMinutes,
      staffMayExceed: row.staffMayExceed,
    },
    row.archivedAt,
    row.exclusions,
  );
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

import { Injectable } from "@nestjs/common";
import {
  orderTimeLimitScopeTypeSchema,
  type OrderTimeLimitScopeType,
  type OrderTimeLimitView,
} from "@lfd/pim-contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { WriteTicket } from "../../../platform/journal/scoped-journal.js";
import { OrderTimeLimit } from "../domain/entities/order-time-limit.js";
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
    return this.views(await this.prisma.orderTimeLimit.findMany());
  }

  /** `archived_at IS NULL` dans la requête : une limite archivée ne s'applique plus. */
  async inForce(): Promise<readonly OrderTimeLimitView[]> {
    return this.views(await this.prisma.orderTimeLimit.findMany({ where: { archivedAt: null } }));
  }

  async findById(id: string): Promise<OrderTimeLimit | null> {
    const row = await this.prisma.orderTimeLimit.findUnique({ where: { id } });
    return row === null ? null : toDomain(row);
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
      staffMayExceed: limit.staffMayExceed,
      archivedAt: limit.archivedAt,
    };
    await this.prisma.orderTimeLimit.upsert({
      where: { id: limit.id },
      create: { id: limit.id, scopeType: limit.scope.type, scopeId: limit.scope.id, ...values },
      update: values,
    });
  }

  async saveArchival(limit: OrderTimeLimit, _ticket: WriteTicket): Promise<void> {
    await this.prisma.orderTimeLimit.update({
      where: { id: limit.id },
      data: { archivedAt: limit.archivedAt },
    });
  }

  private async views(rows: readonly LimitRow[]): Promise<readonly OrderTimeLimitView[]> {
    const labels = await this.targets.labelsOf(rows);
    return rows.flatMap((row) => {
      const view = toView(row, labels);
      return view === null ? [] : [view];
    });
  }
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
    staffMayExceed: row.staffMayExceed,
    archived: row.archivedAt !== null,
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

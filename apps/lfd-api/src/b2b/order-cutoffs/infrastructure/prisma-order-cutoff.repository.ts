import {
  weekdaySchema,
  type OrderCutoffPayload,
  type OrderCutoffView,
  type Weekday,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  DuplicateOrderCutoffError,
  OrderCutoffNotFoundError,
} from "../domain/order-cutoff-errors.js";
import { OrderCutoffRepository } from "../domain/order-cutoff.repository.js";

/** Code Postgres d'une violation de contrainte d'unicité. */
const UNIQUE_VIOLATION = "P2002";

/** Une règle telle que Prisma la sélectionne, avec le nom de son point. */
interface CutoffRow {
  readonly id: string;
  readonly pickupAddressId: string | null;
  readonly weekday: string | null;
  readonly daysBefore: number;
  readonly time: string;
}

@Injectable()
export class PrismaOrderCutoffRepository extends OrderCutoffRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Les règles, triées **de la plus spécifique à la plus générale** : point +
   * jour, puis point, puis défaut + jour, puis défaut. L'écran de réglages les
   * lit dans cet ordre, et `resolveOrderCutoff` reste juste quel que soit l'ordre.
   */
  async list(): Promise<readonly OrderCutoffView[]> {
    const [rows, points] = await Promise.all([
      this.prisma.orderCutoff.findMany({
        orderBy: [{ pickupAddressId: "asc" }, { weekday: "asc" }],
      }),
      this.prisma.pickupAddress.findMany({ select: { id: true, label: true } }),
    ]);
    const labels = new Map(points.map((point) => [point.id, point.label]));
    return rows.map((row) => toView(row, labels)).sort(bySpecificity);
  }

  async create(payload: OrderCutoffPayload): Promise<string> {
    try {
      const created = await this.prisma.orderCutoff.create({
        data: { ...payload },
        select: { id: true },
      });
      return created.id;
    } catch (error: unknown) {
      throw toDomainError(error);
    }
  }

  async update(id: string, payload: OrderCutoffPayload): Promise<void> {
    await this.ensureExists(id);
    try {
      await this.prisma.orderCutoff.update({ where: { id }, data: { ...payload } });
    } catch (error: unknown) {
      throw toDomainError(error);
    }
  }

  async remove(id: string): Promise<void> {
    await this.ensureExists(id);
    await this.prisma.orderCutoff.delete({ where: { id } });
  }

  private async ensureExists(id: string): Promise<void> {
    const found = await this.prisma.orderCutoff.findUnique({ where: { id }, select: { id: true } });
    if (found === null) {
      throw new OrderCutoffNotFoundError(id);
    }
  }
}

/**
 * Une violation d'unicité devient un refus **métier** lisible. Les trois index
 * partiels de la migration couvrent les cas que le `@@unique` de Prisma rate
 * (Postgres traite chaque NULL comme distinct) : ils remontent tous ici.
 */
function toDomainError(error: unknown): Error {
  const code: unknown = error instanceof Error ? Reflect.get(error, "code") : null;
  if (code === UNIQUE_VIOLATION) {
    return new DuplicateOrderCutoffError();
  }
  return error instanceof Error ? error : new Error("Écriture de règle impossible.");
}

function toView(row: CutoffRow, labels: ReadonlyMap<string, string>): OrderCutoffView {
  return {
    id: row.id,
    pickupAddressId: row.pickupAddressId,
    pickupLabel: row.pickupAddressId === null ? null : (labels.get(row.pickupAddressId) ?? null),
    weekday: toWeekday(row.weekday),
    daysBefore: row.daysBefore,
    time: row.time,
  };
}

/**
 * La colonne est un `text` libre côté Postgres : on la **valide** au retour
 * plutôt que de la caster. Une valeur écrite à la main en base ne doit pas
 * remonter en vue et faire échouer une comparaison silencieusement.
 */
function toWeekday(value: string | null): Weekday | null {
  if (value === null) {
    return null;
  }
  const parsed = weekdaySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Rang de spécificité : plus le nombre est bas, plus la règle est précise. */
function rank(rule: OrderCutoffView): number {
  const point = rule.pickupAddressId === null ? 2 : 0;
  const day = rule.weekday === null ? 1 : 0;
  return point + day;
}

function bySpecificity(a: OrderCutoffView, b: OrderCutoffView): number {
  return rank(a) - rank(b) || (a.pickupLabel ?? "").localeCompare(b.pickupLabel ?? "");
}

import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { GeneralOrderCutoffRule } from "../domain/general-order-cutoff.js";
import { GeneralOrderCutoffRepository } from "../domain/general-order-cutoff.repository.js";
import { DuplicateOrderCutoffError } from "../domain/order-cutoff-errors.js";
import { GENERAL_ORDER_CUTOFF_WHERE } from "./general-order-cutoff.row.js";

/** Code Prisma d'une violation de contrainte d'unicité. */
const UNIQUE_VIOLATION = "P2002";

/** L'écriture de la règle générale dans `public.order_cutoffs`. */
@Injectable()
export class PrismaGeneralOrderCutoffRepository extends GeneralOrderCutoffRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(): Promise<GeneralOrderCutoffRule | null> {
    const row = await this.prisma.orderCutoff.findFirst({ where: GENERAL_ORDER_CUTOFF_WHERE });
    return row === null
      ? null
      : GeneralOrderCutoffRule.rehydrate(row.id, {
          daysBefore: row.daysBefore,
          time: row.time,
          graceMinutes: row.graceMinutes,
        });
  }

  async save(rule: GeneralOrderCutoffRule): Promise<void> {
    const data = { ...GENERAL_ORDER_CUTOFF_WHERE, ...rule.terms };
    try {
      await this.prisma.orderCutoff.upsert({
        where: { id: rule.id },
        create: { id: rule.id, ...data },
        update: data,
      });
    } catch (error: unknown) {
      throw toDomainError(error);
    }
  }
}

/** Une violation d'unicité — deux règles générales posées en même temps — devient un refus lisible. */
function toDomainError(error: unknown): Error {
  const code: unknown = error instanceof Error ? Reflect.get(error, "code") : null;
  if (code === UNIQUE_VIOLATION) {
    return new DuplicateOrderCutoffError();
  }
  return error instanceof Error ? error : new OrderCutoffWriteError(error);
}

/** L'écriture a échoué pour une raison qui n'est pas une erreur JavaScript. */
class OrderCutoffWriteError extends TechnicalError {
  constructor(cause: unknown) {
    super(
      "order_cutoffs.write_failed",
      "L'heure limite générale n'a pas pu être enregistrée.",
      cause,
    );
  }
}

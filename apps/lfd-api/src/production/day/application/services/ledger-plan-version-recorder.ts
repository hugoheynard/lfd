import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  PlanVersion,
  type PlanVersionAuthor,
  type PlanVersionCause,
  type WithdrawalEntry,
} from "../../domain/entities/plan-version.js";
import type { ProductionDay } from "../../domain/entities/production-day.js";
import { PlanVersionRecorder } from "../../domain/ports/plan-version.recorder.js";
import { PlanVersionLedger } from "../../domain/ports/plan-version.ledger.js";
import { PlanVersionsReader } from "../../domain/ports/plan-versions.reader.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { WithdrawalsAfterInscriptionReader } from "../../domain/ports/withdrawals-after-inscription.reader.js";

/**
 * L'écrivain des versions, tel que le noyau l'implémente — cf.
 * {@link PlanVersionRecorder}. La version précédente et les retraits après
 * inscription sont relus sous le verrou, la version suivante construite ; si
 * le plan a changé, la journée prend son numéro, puis elle est sauvée (l'état
 * et son numéro par le même `save`), puis la version est ajoutée.
 */
@Injectable()
export class LedgerPlanVersionRecorder extends PlanVersionRecorder {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly versions: PlanVersionsReader,
    private readonly ledger: PlanVersionLedger,
    private readonly withdrawals: WithdrawalsAfterInscriptionReader,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    super();
  }

  async save(
    day: ProductionDay,
    cause: PlanVersionCause,
    by: PlanVersionAuthor,
    withdrawnOrderId: string | null = null,
  ): Promise<void> {
    const previous = await this.versions.latestOf(day.day);
    const withdrawn: readonly WithdrawalEntry[] = (
      await this.withdrawals.afterInscriptionOn(day.day)
    ).map((entry) => ({ ...entry, by: entry.orderId === withdrawnOrderId ? by : null }));
    const next = PlanVersion.next(previous, day.toSnapshot(), cause, withdrawn, by, {
      id: this.ids.next(),
      at: this.clock.now(),
    });
    if (next !== null) {
      day.numberPlanVersion(next.version);
    }
    await this.days.save(day);
    if (next !== null) {
      await this.ledger.append(next);
    }
  }
}

import { TechnicalError } from "../../../../../platform/shared/errors/app-error.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import type { Clock } from "../../../../../platform/time/clock.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { PlanVersion } from "../../../domain/entities/plan-version.js";
import { PlanVersionLedger } from "../../../domain/ports/plan-version.ledger.js";
import { PlanVersionsReader } from "../../../domain/ports/plan-versions.reader.js";
import type { ProductionDay } from "../../../domain/entities/production-day.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import {
  type WithdrawalAfterInscription,
  WithdrawalsAfterInscriptionReader,
} from "../../../domain/ports/withdrawals-after-inscription.reader.js";
import type { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { LedgerPlanVersionRecorder } from "../ledger-plan-version-recorder.js";

/**
 * Les doubles des versions du plan, partagés par les tests des gestes qui
 * changent le plan figé (l'arrêt, le retirage, le lancement, les guichets).
 * Une seule liste, lue par le lecteur et remplie par le registre.
 */
export class PlanVersionStore {
  readonly appended: PlanVersion[] = [];
  /** Le registre refuse l'ajout : un geste dont la version échoue échoue. */
  failing = false;

  readonly ledger: PlanVersionLedger = new StoreLedger(this);
  readonly reader: PlanVersionsReader = new StoreReader(this);
}

class StoreLedger extends PlanVersionLedger {
  constructor(private readonly store: PlanVersionStore) {
    super();
  }

  append(version: PlanVersion): Promise<void> {
    if (this.store.failing) {
      return Promise.reject(new VersionLedgerDown());
    }
    this.store.appended.push(version);
    return Promise.resolve();
  }
}

class StoreReader extends PlanVersionsReader {
  constructor(private readonly store: PlanVersionStore) {
    super();
  }

  latestOf(day: ServiceDay): Promise<PlanVersion | null> {
    const ofDay = this.store.appended.filter((version) => version.serviceDay === day.value);
    return Promise.resolve(ofDay.at(-1) ?? null);
  }
}

/** La panne du registre des versions, telle que le double la lève. */
export class VersionLedgerDown extends TechnicalError {
  constructor() {
    super("test.plan_version.ledger_down", "Registre des versions indisponible (double).");
  }
}

/** Les retraits après inscription, fixés par le test. */
export class FixedWithdrawalsAfterInscription extends WithdrawalsAfterInscriptionReader {
  constructor(public entries: readonly WithdrawalAfterInscription[] = []) {
    super();
  }

  afterInscriptionOn(): Promise<readonly WithdrawalAfterInscription[]> {
    return Promise.resolve(this.entries);
  }
}

/** La journée du test, relue telle que le dernier `save` l'a laissée ; chaque `save` est compté. */
export class StoredDays extends ProductionDayRepository {
  saves = 0;

  constructor(public current: ProductionDay) {
    super();
  }

  load(): Promise<ProductionDay> {
    return Promise.resolve(this.current);
  }

  save(day: ProductionDay): Promise<void> {
    this.saves += 1;
    this.current = day;
    return Promise.resolve();
  }
}

/** Un écrivain des versions réel, posé sur le dépôt doublé du test. */
export function planVersionRecorder(
  days: ProductionDayRepository,
  store: PlanVersionStore = new PlanVersionStore(),
  withdrawals: WithdrawalsAfterInscriptionReader = new FixedWithdrawalsAfterInscription(),
  clock: Clock = new FixedClock(new Date(0)),
): LedgerPlanVersionRecorder {
  return new LedgerPlanVersionRecorder(
    days,
    store.reader,
    store.ledger,
    withdrawals,
    new FixedIdGenerator("version"),
    clock,
  );
}

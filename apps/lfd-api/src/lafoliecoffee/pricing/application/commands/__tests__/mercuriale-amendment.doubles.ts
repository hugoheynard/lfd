import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import type { CompanyMercuriale } from "../../../domain/entities/company-mercuriale.js";
import { CompanyMercurialeRepository } from "../../../domain/ports/company-mercuriale.repository.js";
import type { PricingAct } from "../../../domain/pricing-act.js";

/*
 * Les doublés partagés des gestes qui écrivent un avenant (saisi, ou
 * reporté) : le verrou et l'écriture disent s'ils ont eu lieu DANS
 * l'unité de travail.
 */

/** Ce qui s'est passé, dans l'ordre, et si c'était dans la transaction. */
export type Trace = string[];

export class TracingUnitOfWork extends UnitOfWork {
  open = false;
  constructor(private readonly trace: Trace) {
    super();
  }
  async run<T>(work: () => Promise<T>): Promise<T> {
    this.trace.push("begin");
    this.open = true;
    try {
      return await work();
    } finally {
      this.open = false;
      this.trace.push("end");
    }
  }
}

export class LockingMercuriales extends CompanyMercurialeRepository {
  readonly written: { mercuriale: CompanyMercuriale; amendmentId: string; act: PricingAct }[] = [];
  constructor(
    private readonly trace: Trace,
    private readonly uow: TracingUnitOfWork,
    private readonly stored: CompanyMercuriale | null,
  ) {
    super();
  }
  lockForAmendment(): Promise<CompanyMercuriale | null> {
    this.trace.push(this.uow.open ? "lock+load (in tx)" : "lock+load (OUTSIDE tx)");
    return Promise.resolve(this.stored);
  }
  addAmendment(mercuriale: CompanyMercuriale, amendmentId: string, act: PricingAct): Promise<void> {
    this.trace.push(this.uow.open ? "write (in tx)" : "write (OUTSIDE tx)");
    this.written.push({ mercuriale, amendmentId, act });
    return Promise.resolve();
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  update(): Promise<void> {
    return Promise.resolve();
  }
  rename(): Promise<void> {
    return Promise.resolve();
  }
  load(): Promise<CompanyMercuriale | null> {
    return Promise.resolve(null);
  }
  archivedOverlapping(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }
  runningFor(): Promise<CompanyMercuriale | null> {
    return Promise.resolve(null);
  }
}

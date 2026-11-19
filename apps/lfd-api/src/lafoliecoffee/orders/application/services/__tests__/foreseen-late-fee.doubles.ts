import type { OrderCutoffView } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { UnsealedCatalogItem } from "../../../../catalog/domain/ports/product-catalog.reader.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import { OrderCutoffReader } from "../../../domain/ports/order-cutoff.reader.js";
import { OrderCutoffWaiverGate } from "../../../domain/ports/order-cutoff-waiver.gate.js";
import {
  OrderLateFeeReader,
  type LateFeeSetting,
} from "../../../domain/ports/order-late-fee.reader.js";
import { openPlanGate } from "../../commands/__tests__/plan-doubles.js";
import { ForeseenLateFee } from "../foreseen-late-fee.service.js";
import { deadlineOf } from "./order-deadline-of.js";
import { shelfCircuitOf } from "./shelf-circuit-doubles.js";

class Rules extends OrderCutoffReader {
  constructor(private readonly rules: readonly OrderCutoffView[]) {
    super();
  }
  list(): Promise<readonly OrderCutoffView[]> {
    return Promise.resolve(this.rules);
  }
}

/**
 * La dérogation ouverte de la société, et ce qui en a été fait : `consumed`
 * reste vide tant que personne ne la dépense — c'est ce qu'un devis prouve.
 */
export class RecordingWaivers extends OrderCutoffWaiverGate {
  readonly asked: string[] = [];
  readonly consumed: string[] = [];

  constructor(private readonly open: { readonly id: string } | null) {
    super();
  }
  openFor(companyId: string, fulfillmentDate: string): Promise<{ id: string } | null> {
    this.asked.push(`${companyId}@${fulfillmentDate}`);
    return Promise.resolve(this.open);
  }
  consume(waiverId: string): Promise<void> {
    this.consumed.push(waiverId);
    return Promise.resolve();
  }
}

class Setting extends OrderLateFeeReader {
  constructor(private readonly setting: LateFeeSetting | null) {
    super();
  }
  current(): Promise<LateFeeSetting | null> {
    return Promise.resolve(this.setting);
  }
}

/** Ce qui varie d'un jugement de retard à l'autre ; par défaut, rien à juger. */
export interface LateFeeSetup {
  readonly now: Date;
  readonly catalog: readonly UnsealedCatalogItem[];
  readonly rules?: readonly OrderCutoffView[];
  readonly waivers?: RecordingWaivers;
  readonly setting?: LateFeeSetting | null;
}

/** La surtaxe prévue montée sur ses vrais services (verdict, juge, circuit), ports doublés. */
export function foreseenLateFeeOf(setup: LateFeeSetup): ForeseenLateFee {
  return new ForeseenLateFee(
    deadlineOf({
      cutoffs: new Rules(setup.rules ?? []),
      catalog: new InMemoryProductCatalog(setup.catalog),
      waivers: setup.waivers ?? new RecordingWaivers(null),
      lateFees: new Setting(setup.setting ?? null),
    }),
    shelfCircuitOf(openPlanGate()),
    new FixedClock(setup.now),
  );
}

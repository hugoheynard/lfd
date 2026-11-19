import type { OrderCutoffView } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { UnsealedCatalogItem } from "../../../../catalog/domain/ports/product-catalog.reader.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import { OrderCutoffsInForce } from "../../../../order-cutoffs/domain/order-cutoffs-in-force.js";
import {
  LateFeeSettingReader,
  OpenWaiverReader,
} from "../../../../order-cutoffs/domain/deadline/ports/deadline-sources.js";
import type { LateFeeSetting } from "../../../../order-waivers/domain/late-fee-setting.js";
import { openPlanGate } from "../../commands/__tests__/plan-doubles.js";
import { ForeseenLateFee } from "../foreseen-late-fee.service.js";
import { deadlineOf } from "./order-deadline-of.js";
import { shelfCircuitOf } from "./shelf-circuit-doubles.js";

class Rules extends OrderCutoffsInForce {
  constructor(private readonly rules: readonly OrderCutoffView[]) {
    super();
  }
  list(): Promise<readonly OrderCutoffView[]> {
    return Promise.resolve(this.rules);
  }
}

/**
 * La dérogation ouverte de la société, et qui l'a demandée. Un devis ne peut
 * pas la dépenser : il ne reçoit que la lecture.
 */
export class RecordingWaivers extends OpenWaiverReader {
  readonly asked: string[] = [];

  constructor(private readonly open: { readonly id: string } | null) {
    super();
  }
  openFor(companyId: string, fulfillmentDate: string): Promise<{ id: string } | null> {
    this.asked.push(`${companyId}@${fulfillmentDate}`);
    return Promise.resolve(this.open);
  }
}

class Setting extends LateFeeSettingReader {
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

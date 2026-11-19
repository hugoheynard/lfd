import type { LateFeeAdjustment, OrderCutoffView } from "@lfd/contracts";

import { JudgingOrderDeadline } from "../../../../order-cutoffs/application/deadline/judging-order-deadline.service.js";
import type { WaiverAvailable } from "../../../../order-cutoffs/domain/deadline/order-deadline-verdict.js";
import {
  LateFeeSettingReader,
  OpenWaiverReader,
} from "../../../../order-cutoffs/domain/deadline/ports/deadline-sources.js";
import { OrderCutoffsInForce } from "../../../../order-cutoffs/domain/order-cutoffs-in-force.js";
import { CatalogItemOrderLimitsReader } from "../../../../order-cutoffs/infrastructure/deadline/catalog-item-order-limits.reader.js";
import type { ProductCatalogReader } from "../../../../catalog/domain/ports/product-catalog.reader.js";
import type { OrderCutoffReader } from "../../../domain/ports/order-cutoff.reader.js";
import type { OrderCutoffWaiverGate } from "../../../domain/ports/order-cutoff-waiver.gate.js";
import type { OrderLateFeeReader } from "../../../domain/ports/order-late-fee.reader.js";

/**
 * **Le vrai délai de commande, monté sur les doubles des specs de passation.**
 *
 * Les specs de passation doublent les sources de l'heure limite par les ports
 * d'`orders` ; le verdict les lit par les siens. Ce montage les relie sans
 * doubler le juge : la passation éprouvée juge par le vrai service et le vrai
 * juge pur. Il se retire au lot V7, avec les ports d'`orders` qu'il traduit.
 */
export function deadlineOf(sources: {
  readonly cutoffs: OrderCutoffReader;
  readonly catalog: ProductCatalogReader;
  readonly waivers: OrderCutoffWaiverGate;
  readonly lateFees: OrderLateFeeReader;
}): JudgingOrderDeadline {
  return new JudgingOrderDeadline(
    new RulesFrom(sources.cutoffs),
    new CatalogItemOrderLimitsReader(sources.catalog),
    new WaiversFrom(sources.waivers),
    new FeesFrom(sources.lateFees),
  );
}

class RulesFrom extends OrderCutoffsInForce {
  constructor(private readonly cutoffs: OrderCutoffReader) {
    super();
  }
  list(): Promise<readonly OrderCutoffView[]> {
    return this.cutoffs.list();
  }
}

class WaiversFrom extends OpenWaiverReader {
  constructor(private readonly waivers: OrderCutoffWaiverGate) {
    super();
  }
  openFor(companyId: string, serviceDay: string): Promise<WaiverAvailable | null> {
    return this.waivers.openFor(companyId, serviceDay);
  }
}

class FeesFrom extends LateFeeSettingReader {
  constructor(private readonly fees: OrderLateFeeReader) {
    super();
  }
  current(): Promise<LateFeeAdjustment | null> {
    return this.fees.current();
  }
}

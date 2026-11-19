import type { LateFeeAdjustment } from "@lfd/contracts";

import { JudgingOrderDeadline } from "../../../../order-cutoffs/application/deadline/judging-order-deadline.service.js";
import {
  LateFeeSettingReader,
  OpenWaiverReader,
} from "../../../../order-cutoffs/domain/deadline/ports/deadline-sources.js";
import type { OrderCutoffsInForce } from "../../../../order-cutoffs/domain/order-cutoffs-in-force.js";
import { CatalogItemOrderLimitsReader } from "../../../../order-cutoffs/infrastructure/deadline/catalog-item-order-limits.reader.js";
import type { ProductCatalogReader } from "../../../../catalog/domain/ports/product-catalog.reader.js";

/**
 * **Le vrai délai de commande, monté sur les doubles d'une spec** : le vrai
 * service, le vrai juge pur et la vraie lecture des limites par le catalogue.
 * Seules les sources sont doublées. Sans dérogation ni réglage de surtaxe
 * quand la spec n'en pose pas : rien n'est ouvert, rien ne se facture.
 */
export function deadlineOf(sources: {
  readonly cutoffs: OrderCutoffsInForce;
  readonly catalog: ProductCatalogReader;
  readonly waivers?: OpenWaiverReader;
  readonly lateFees?: LateFeeSettingReader;
}): JudgingOrderDeadline {
  return new JudgingOrderDeadline(
    sources.cutoffs,
    new CatalogItemOrderLimitsReader(sources.catalog),
    sources.waivers ?? new NoOpenWaiver(),
    sources.lateFees ?? new NoLateFee(),
  );
}

class NoOpenWaiver extends OpenWaiverReader {
  openFor(): Promise<null> {
    return Promise.resolve(null);
  }
}

class NoLateFee extends LateFeeSettingReader {
  current(): Promise<LateFeeAdjustment | null> {
    return Promise.resolve(null);
  }
}

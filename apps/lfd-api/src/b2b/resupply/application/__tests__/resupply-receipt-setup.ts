import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  PackedResuppliesReader,
  type PackedResupplyLines,
} from "../../../../packing/channels/commerce/index.js";
import type { SiteResupplySnapshot } from "../../domain/site-resupply.js";
import { CorrectReceivedResupplyLineHandler } from "../correct-received-resupply-line.handler.js";
import { CorrectResupplyLineHandler } from "../correct-resupply-line.handler.js";
import { GetResupplyReceiptHandler } from "../get-resupply-receipt.handler.js";
import { ReceiveResupplyLineHandler } from "../receive-resupply-line.handler.js";
import { ReceiveSiteResupplyHandler } from "../receive-site-resupply.handler.js";
import { WithdrawResupplyLineHandler } from "../withdraw-resupply-line.handler.js";
import {
  Catalogue,
  Directory,
  InMemoryReceiptReader,
  InMemoryReceipts,
  Sites,
} from "./resupply-doubles.js";
import { InMemorySiteResupplies, InMemorySiteResupplyReader } from "./site-resupply-doubles.js";
import { InMemoryStockAlerts } from "./stock-alert-doubles.js";

/** Le banc des handlers de la réception (lot R2) : doubles partagés, une horloge fixe. */
/** 09:00 à Paris le jour du réassort : « Réceptionner » n'est permis qu'à partir de sa journée. */
export const AT = new Date("2026-01-02T08:00:00Z");
export const SITE = "site_village";
export const OTHER = "site_labo";
export const DAY = "2026-01-02";
export const CATALOGUE = new Catalogue([
  { sku: "CRO", name: "Croissant", categoryId: "fam_morning", categoryName: "Viennoiseries" },
  {
    sku: "PAC",
    name: "Pain au chocolat",
    categoryId: "fam_morning",
    categoryName: "Viennoiseries",
  },
]);
export const AUTHOR = { staffUserId: "staff_lou", name: "Lou Martin", role: "counter" };

/** Un réassort envoyé, tel que la base le rendrait. */
export function placed(
  id: string,
  lines: SiteResupplySnapshot["lines"],
  overrides: Partial<SiteResupplySnapshot> = {},
): SiteResupplySnapshot {
  return {
    id,
    siteId: SITE,
    target: "asap",
    serviceDay: DAY,
    version: 2,
    origin: "counter",
    name: null,
    lines,
    placed: { at: AT, author: AUTHOR },
    cancelled: null,
    arrived: null,
    ...overrides,
  };
}

/**
 * L'emballé au colisage, posé à la main (lot R3b) : un réassort absent de la
 * table n'a pas de fiche close.
 */
export class FixedPackedResupplies extends PackedResuppliesReader {
  readonly closed = new Map<string, PackedResupplyLines>();

  packedOf(ids: readonly string[]): Promise<ReadonlyMap<string, PackedResupplyLines | null>> {
    return Promise.resolve(new Map(ids.map((id) => [id, this.closed.get(id) ?? null])));
  }
}

export function setup() {
  const packed = new FixedPackedResupplies();
  const receipts = new InMemoryReceipts();
  const resupplies = new InMemorySiteResupplies();
  const alerts = new InMemoryStockAlerts();
  const staff = new Directory({ name: "Lou Martin", role: "counter" });
  const clock = new FixedClock(AT);
  const uow = new DirectUnitOfWork();
  const ids = new FixedIdGenerator("receipt");
  return {
    receipts,
    resupplies,
    alerts,
    packed,
    receiveResupply: new ReceiveSiteResupplyHandler(
      resupplies,
      receipts,
      alerts,
      staff,
      clock,
      ids,
      uow,
      packed,
    ),
    correctReceived: new CorrectReceivedResupplyLineHandler(receipts, staff, clock, uow),
    receive: new ReceiveResupplyLineHandler(
      receipts,
      alerts,
      CATALOGUE,
      new Sites([SITE]),
      staff,
      clock,
      ids,
      uow,
    ),
    correct: new CorrectResupplyLineHandler(receipts, staff, clock, uow),
    withdraw: new WithdrawResupplyLineHandler(receipts, staff, clock, uow),
    read: new GetResupplyReceiptHandler(
      new InMemoryReceiptReader(receipts),
      new InMemorySiteResupplyReader(resupplies),
      packed,
    ),
  };
}

export const CRO_24 = [{ sku: "CRO", label: "Croissant", quantity: 24 }];

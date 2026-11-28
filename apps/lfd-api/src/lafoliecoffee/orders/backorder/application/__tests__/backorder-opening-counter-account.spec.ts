import { RecordingJournal } from "../../../../../platform/journal/__tests__/recording-journal.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import {
  CompanyStatusReader,
  type OrderCompanyStatus,
} from "../../../domain/ports/company-status.reader.js";
import type { BackorderOrigin } from "../../domain/ports/backorder-origin.reader.js";
import { BackorderOpening } from "../backorder-opening.js";
import { FixedBackorderOrigins, RecordingBackorders } from "./backorder-doubles.js";

class FixedStatus extends CompanyStatusReader {
  constructor(private readonly status: OrderCompanyStatus) {
    super();
  }
  companyStatusOf(): Promise<OrderCompanyStatus | null> {
    return Promise.resolve(this.status);
  }
}

const ORIGIN: BackorderOrigin = {
  companyId: "co_1",
  buyerUserId: "u_1",
  lines: [{ sku: "CRO", quantity: 12, saleUnit: "piece" }],
};

function scene(status: OrderCompanyStatus) {
  const backorders = new RecordingBackorders([]);
  const journal = new RecordingJournal();
  const opening = new BackorderOpening(
    new FixedBackorderOrigins(ORIGIN),
    backorders,
    journal,
    new FixedIdGenerator("bo"),
    new FixedStatus(status),
  );
  return { backorders, journal, opening };
}

const BIRTH = {
  originOrderId: "ord_1",
  originReference: "ORD-0001",
  departing: [{ sku: "CRO", quantity: 9 }],
  decidedAt: new Date(5_000),
};

/** Un compte ouvert au comptoir n'a pas de reliquat (`plan-comptes-du-comptoir.md`, § 3.7). */
describe("BackorderOpening — compte ouvert au comptoir", () => {
  it("n'ouvre aucun reliquat et n'écrit rien au journal", async () => {
    const { backorders, journal, opening } = scene("counter_opened");

    await opening.openAfter(BIRTH);

    expect(backorders.saved).toEqual([]);
    expect(journal.facts).toEqual([]);
  });

  it("une société active garde son reliquat", async () => {
    const { backorders, opening } = scene("active");

    await opening.openAfter(BIRTH);

    expect(backorders.saved).toHaveLength(1);
  });
});

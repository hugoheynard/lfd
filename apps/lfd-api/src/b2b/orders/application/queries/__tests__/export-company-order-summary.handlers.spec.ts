import type { Buffer } from "node:buffer";

import { BrandLogoSource } from "../../../../../platform/brand/brand-logo.source.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { OrderCompanyNotFoundError } from "../../../domain/errors/order-errors.js";
import {
  InvertedOrderDayRangeError,
  OrderSummaryOrdersNotFoundError,
} from "../../../domain/errors/order-summary-errors.js";
import {
  CompanyOrderSummaryReader,
  type CompanyOrderSummaryScope,
} from "../../../domain/ports/company-order-summary.reader.js";
import {
  OrderGuardReader,
  type AccountSettlementStanding,
  type OrderCompanyStatus,
  type OrderRole,
} from "../../../domain/ports/order-guard.reader.js";
import { OrderSummaryRequesterReader } from "../../../domain/ports/order-summary-requester.reader.js";
import type { OrderSummarySource } from "../../../domain/services/order-summary.js";
import { LOGO } from "../../../domain/services/__tests__/client-sheet.fixture.js";
import { pdfText } from "../../../domain/services/__tests__/pdf-text.js";
import { ExportCompanyOrderSummaryCsvHandler } from "../export-company-order-summary-csv.handler.js";
import { ExportCompanyOrderSummaryCsvQuery } from "../export-company-order-summary-csv.query.js";
import { ExportCompanyOrderSummaryPdfHandler } from "../export-company-order-summary-pdf.handler.js";
import { ExportCompanyOrderSummaryPdfQuery } from "../export-company-order-summary-pdf.query.js";

/** Le rôle PROPRE dans la société listée — seul ce que les handlers lisent. */
class OwnRole extends OrderGuardReader {
  constructor(private readonly role: OrderRole | null) {
    super();
  }
  roleOf(): Promise<OrderRole | null> {
    return Promise.resolve(this.role);
  }
  companyStatusOf(): Promise<OrderCompanyStatus | null> {
    return Promise.reject(new Error("non utilisé"));
  }
  settlesOnAccount(): Promise<AccountSettlementStanding> {
    return Promise.reject(new Error("non utilisé"));
  }
}

/** Rend, sous le « mur », les seules commandes qu'il connaît ; compte ses lectures. */
class RecordingSummary extends CompanyOrderSummaryReader {
  readonly scopes: CompanyOrderSummaryScope[] = [];
  constructor(private readonly visible: readonly OrderSummarySource[]) {
    super();
  }
  ordersFor(scope: CompanyOrderSummaryScope): Promise<readonly OrderSummarySource[]> {
    this.scopes.push(scope);
    return Promise.resolve(this.visible.filter((o) => scope.orderIds.includes(o.id)));
  }
}

class Requester extends OrderSummaryRequesterReader {
  constructor(private readonly name: string | null) {
    super();
  }
  nameOf(): Promise<string | null> {
    return Promise.resolve(this.name);
  }
}

class RepositoryLogo extends BrandLogoSource {
  load(): Promise<Buffer> {
    return Promise.resolve(LOGO);
  }
}

// Le rendu ne compare pas cet instant à l'horloge : il l'imprime.
const NOW = new Date("2026-10-21T08:00:00.000Z");

const source = (id: string): OrderSummarySource => ({
  id,
  orderNumber: `CMD-${id}`,
  companyId: "co_principal",
  companyName: "Maison mère",
  cancelled: false,
  paymentStatus: "not_required",
  subtotalCents: 1_000,
  discountCents: 0,
  voucherDiscountCents: 0,
  deliveryFeeCents: 0,
  lateFeeCents: 0,
  vatCents: 55,
  vatShares: [{ rate: 5.5, amountCents: 55 }],
  totalCents: 1_055,
  lines: [{ sku: "VIE-001", name: "Croissant", quantity: 1, lineTotalCents: 1_000 }],
});

function pdfHandler(
  reader: RecordingSummary,
  name: string | null = "Maison mère",
  role: OrderRole | null = "owner",
) {
  return new ExportCompanyOrderSummaryPdfHandler(
    new OwnRole(role),
    reader,
    new Requester(name),
    new RepositoryLogo(),
    new FixedClock(NOW),
  );
}

function csvHandler(reader: RecordingSummary) {
  return new ExportCompanyOrderSummaryCsvHandler(
    new OwnRole("owner"),
    reader,
    new Requester("Maison mère"),
    new FixedClock(NOW),
  );
}

describe("le récapitulatif imprimé et au tableur (lot R2)", () => {
  it("PDF : UNE lecture sous le mur, nommé par la société et le jour", async () => {
    const reader = new RecordingSummary([source("o1"), source("o2")]);

    const file = await pdfHandler(reader).execute(
      new ExportCompanyOrderSummaryPdfQuery("usr_1", "co_principal", ["o1", "o2"]),
    );

    expect(reader.scopes).toHaveLength(1);
    expect(file.fileName).toBe("recapitulatif-maison-mere-2026-10-21.pdf");
    expect(pdfText(file.bytes)).toContain("21,10");
  });

  it("CSV : même lecture, même nom au bon suffixe", async () => {
    const reader = new RecordingSummary([source("o1")]);

    const file = await csvHandler(reader).execute(
      new ExportCompanyOrderSummaryCsvQuery("usr_1", "co_principal", ["o1"]),
    );

    expect(reader.scopes).toHaveLength(1);
    expect(file.fileName).toBe("recapitulatif-maison-mere-2026-10-21.csv");
    expect(file.csv).toContain('"Maison mère";"Croissant";"VIE-001";1;10,00');
  });

  it("les refus sont ceux de l'écran : un id hors du mur est nommé", async () => {
    const reader = new RecordingSummary([source("o1")]);

    await expect(
      csvHandler(reader).execute(
        new ExportCompanyOrderSummaryCsvQuery("usr_1", "co_principal", ["o1", "o_frere"]),
      ),
    ).rejects.toEqual(new OrderSummaryOrdersNotFoundError(["o_frere"]));
  });

  it("la période du corps est imprimée, la sélection reste celle des ids (§9)", async () => {
    const reader = new RecordingSummary([source("o1")]);

    const file = await csvHandler(reader).execute(
      new ExportCompanyOrderSummaryCsvQuery("usr_1", "co_principal", ["o1"], {
        from: "2026-10-01",
        to: "2026-10-15",
      }),
    );

    expect(reader.scopes).toEqual([
      { actorUserId: "usr_1", companyId: "co_principal", orderIds: ["o1"] },
    ]);
    expect(file.csv).toContain("Retraits et livraisons du 1er au 15 octobre 2026");
  });

  it("une période inversée est refusée avant toute lecture", async () => {
    const reader = new RecordingSummary([source("o1")]);

    await expect(
      pdfHandler(reader).execute(
        new ExportCompanyOrderSummaryPdfQuery("usr_1", "co_principal", ["o1"], {
          from: "2026-10-15",
          to: "2026-10-01",
        }),
      ),
    ).rejects.toBeInstanceOf(InvertedOrderDayRangeError);
    expect(reader.scopes).toEqual([]);
  });

  it("sans rattachement : 404, et rien n'est lu", async () => {
    const reader = new RecordingSummary([source("o1")]);

    await expect(
      pdfHandler(reader, "Maison mère", null).execute(
        new ExportCompanyOrderSummaryPdfQuery("usr_1", "co_principal", ["o1"]),
      ),
    ).rejects.toBeInstanceOf(OrderCompanyNotFoundError);
    expect(reader.scopes).toEqual([]);
  });

  it("une société disparue entre deux lectures : 404, pas un nom inventé", async () => {
    await expect(
      pdfHandler(new RecordingSummary([source("o1")]), null).execute(
        new ExportCompanyOrderSummaryPdfQuery("usr_1", "co_principal", ["o1"]),
      ),
    ).rejects.toBeInstanceOf(OrderCompanyNotFoundError);
  });
});

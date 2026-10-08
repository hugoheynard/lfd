import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { InvoiceDossierLateFeeRateMissingError } from "../../../domain/errors/invoice-dossier-errors.js";
import {
  FutureStatementMonthError,
  StatementCompanyNotFoundError,
} from "../../../domain/errors/statement-errors.js";
import {
  InvoiceDossierReader,
  type InvoiceDossierOrder,
} from "../../../domain/ports/invoice-dossier.reader.js";
import {
  StatementBillingReader,
  type BillingFollow,
  type SelfPayingEntity,
} from "../../../domain/ports/statement-billing.reader.js";
import type { BillingCycle } from "../../../domain/services/billing-cycle.js";
import type { FrozenInvoiceOrder } from "../../../domain/services/invoice-dossier.types.js";
import { ExportInvoiceDossierHandler } from "../export-invoice-dossier.handler.js";
import { GetInvoiceDossierHandler } from "../get-invoice-dossier.handler.js";
import { ExportInvoiceDossierQuery, GetInvoiceDossierQuery } from "../invoice-dossier-queries.js";

/**
 * Dates absolues sur une horloge FIXÉE — jamais comparées au mur (CLAUDE.md §5).
 * 5 octobre 2026, midi à Paris.
 */
const NOW = new Date("2026-10-05T10:00:00.000Z");

/** Retient ce qui est demandé ; rend les bons des sociétés demandées. */
class RecordingDossiers extends InvoiceDossierReader {
  readonly asked: { companyIds: readonly string[]; cycle: BillingCycle }[] = [];

  constructor(
    private readonly name: string | null,
    private readonly entries: readonly InvoiceDossierOrder[],
  ) {
    super();
  }

  dossierCompanyName(): Promise<string | null> {
    return Promise.resolve(this.name);
  }

  dossierOrders(
    companyIds: readonly string[],
    cycle: BillingCycle,
  ): Promise<readonly InvoiceDossierOrder[]> {
    this.asked.push({ companyIds, cycle });
    return Promise.resolve(
      this.entries.filter(
        (entry) =>
          companyIds.includes(entry.companyId) ||
          (entry.billedCompanyId !== null && companyIds.includes(entry.billedCompanyId)),
      ),
    );
  }
}

class FixedBilling extends StatementBillingReader {
  constructor(private readonly towards: readonly BillingFollow[] = []) {
    super();
  }

  followsTowards(): Promise<readonly BillingFollow[]> {
    return Promise.resolve(this.towards);
  }

  followsOf(): Promise<readonly BillingFollow[]> {
    return Promise.resolve([]);
  }

  selfPayingSubAccounts(): Promise<readonly SelfPayingEntity[]> {
    return Promise.resolve([]);
  }
}

/** Un bon d'une baguette à 1,00 € HT, 5,5 %, ventilé et cohérent. */
function bon(
  reference: string,
  requestedDeliveryDate: string | null,
  overrides: Partial<FrozenInvoiceOrder> = {},
): FrozenInvoiceOrder {
  return {
    reference,
    createdAt: new Date("2026-09-12T08:00:00.000Z"),
    requestedDeliveryDate,
    lines: [
      {
        sku: "BAG-001",
        productNameSnapshot: "Baguette",
        unitPriceMillicents: 100_000,
        vatRate: "5.50",
        quantity: 1,
        lineTotalCents: 100,
      },
    ],
    discountCents: 0,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    deliveryVatMode: null,
    lateFeeCents: 0,
    lateFeeVatRate: null,
    vatShares: [{ rate: 5.5, amountCents: 6 }],
    vatCents: 6,
    totalCents: 106,
    ...overrides,
  };
}

function entry(
  companyId: string,
  order: FrozenInvoiceOrder,
  billedCompanyId: string | null = null,
) {
  return { companyId, billedCompanyId, order };
}

const SITE_FOLLOW: BillingFollow = {
  companyId: "site",
  payerId: "c1",
  payerName: "Maison mère",
  validFrom: new Date("2026-01-01T00:00:00.000Z"),
  validTo: null,
};

function getHandler(reader: InvoiceDossierReader, billing = new FixedBilling()) {
  return new GetInvoiceDossierHandler(reader, billing, new FixedClock(NOW));
}

describe("GetInvoiceDossierHandler", () => {
  it("lit le mois demandé, pour la société et ses sites suivis, et rend le dossier", async () => {
    const reader = new RecordingDossiers("Maison mère", [
      entry("c1", bon("CMD-1", "2026-09-14")),
      entry("site", bon("CMD-2", "2026-09-15")),
    ]);
    const view = await getHandler(reader, new FixedBilling([SITE_FOLLOW])).execute(
      new GetInvoiceDossierQuery("c1", "2026-09"),
    );

    expect(reader.asked[0]?.companyIds).toEqual(["c1", "site"]);
    expect(reader.asked[0]?.cycle.startsAt.toISOString()).toBe("2026-08-31T22:00:00.000Z");
    expect(view.cycle).toMatchObject({ month: "2026-09", inProgress: false });
    expect(view.orders.map((order) => order.reference)).toEqual(["CMD-1", "CMD-2"]);
    expect(view.invoice.lines).toEqual([
      expect.objectContaining({ sku: "BAG-001", quantity: 2, amountCents: 200 }),
    ]);
    expect(view.ordersTotalCents).toBe(212);
    expect(view.differenceCents).toBe(view.gaps.totalCents);
    expect(view.threeGapInvariantHolds).toBe(true);
  });

  it("écarte le bon d'un site que la société ne réglait pas, comme le relevé", async () => {
    const reader = new RecordingDossiers("Maison mère", [
      entry("c1", bon("CMD-1", "2026-09-14")),
      entry("site", bon("CMD-2", "2026-09-15"), "autre-payeur"),
    ]);
    const view = await getHandler(reader, new FixedBilling([SITE_FOLLOW])).execute(
      new GetInvoiceDossierQuery("c1", "2026-09"),
    );

    expect(view.orders.map((order) => order.reference)).toEqual(["CMD-1"]);
  });

  it("signale les bons livrés un autre mois et ceux sans date, sans les retirer", async () => {
    const reader = new RecordingDossiers("Maison mère", [
      entry("c1", bon("CMD-1", "2026-09-14")),
      entry("c1", bon("CMD-2", "2026-10-02")),
      entry("c1", bon("CMD-3", null)),
    ]);
    const view = await getHandler(reader).execute(new GetInvoiceDossierQuery("c1", "2026-09"));

    expect(view.orders).toHaveLength(3);
    expect(view.otherMonthOrders).toEqual([
      { reference: "CMD-2", requestedDeliveryDate: "2026-10-02" },
    ]);
    expect(view.ordersWithoutDate).toEqual(["CMD-3"]);
  });

  it("refuse une société inconnue et un mois futur", async () => {
    await expect(
      getHandler(new RecordingDossiers(null, [])).execute(
        new GetInvoiceDossierQuery("x", undefined),
      ),
    ).rejects.toBeInstanceOf(StatementCompanyNotFoundError);
    await expect(
      getHandler(new RecordingDossiers("Maison mère", [])).execute(
        new GetInvoiceDossierQuery("c1", "2026-11"),
      ),
    ).rejects.toBeInstanceOf(FutureStatementMonthError);
  });

  it("arrête le dossier sur une surtaxe sans taux, en nommant le bon", async () => {
    const reader = new RecordingDossiers("Maison mère", [
      entry("c1", bon("CMD-7", "2026-09-14", { lateFeeCents: 50, totalCents: 156 })),
    ]);
    await expect(
      getHandler(reader).execute(new GetInvoiceDossierQuery("c1", "2026-09")),
    ).rejects.toBeInstanceOf(InvoiceDossierLateFeeRateMissingError);
  });
});

describe("ExportInvoiceDossierHandler", () => {
  const reader = new RecordingDossiers("Maison mère", [
    entry("c1", bon("CMD-1", "2026-09-14")),
    entry("c1", bon("CMD-2", null)),
  ]);
  const handler = new ExportInvoiceDossierHandler(reader, new FixedBilling(), new FixedClock(NOW));

  it("rend la facture en CSV, euros à la virgule, et la nomme simulée", async () => {
    const file = await handler.execute(new ExportInvoiceDossierQuery("c1", "2026-09", "invoice"));

    expect(file.fileName).toBe("DOSSIER-FACTURE-SIMULEE-Maison mère-2026-09.csv");
    expect(file.csv.startsWith("﻿")).toBe(true);
    expect(file.csv).toContain('"BAG-001";"Baguette";"1,00000";"5,5 %";2;2,00');
  });

  it("rend les bons, et dit celui qui n'a pas de date", async () => {
    const file = await handler.execute(new ExportInvoiceDossierQuery("c1", "2026-09", "orders"));

    expect(file.fileName).toBe("DOSSIER-BONS-Maison mère-2026-09.csv");
    expect(file.csv).toContain('"sans date demandée"');
  });

  it("rend les écarts, et leur somme", async () => {
    const file = await handler.execute(new ExportInvoiceDossierQuery("c1", "2026-09", "gaps"));

    expect(file.fileName).toBe("DOSSIER-ECARTS-Maison mère-2026-09.csv");
    expect(file.csv).toContain('"Total";"total facture − Σ bons"');
  });
});

import {
  OrderDeliveryHistoryReader,
  type OrderDeliveryStopFact,
} from "../../../../../delivery/channels/commerce/index.js";
import {
  OrderHandoverHistoryReader,
  type OrderHandoverHistoryFact,
} from "../../../../../handover/channels/commerce/index.js";
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
import { InvoiceIssuersReader } from "../../../domain/ports/invoice-issuers.reader.js";
import { StatementBuyerReader } from "../../../domain/ports/statement-buyer.reader.js";
import type { StatementBuyer } from "../../../domain/entities/billing-statement.js";
import type { InvoiceSellerFacts } from "../../../domain/services/invoice-issuance-blockers.js";
import { InvoicePaymentTerms } from "../../../domain/value-objects/invoice-payment-terms.js";
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

/** Rend les retraits connus, et retient chaque lot demandé (une lecture par dossier). */
class FixedHandovers extends OrderHandoverHistoryReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly facts: readonly OrderHandoverHistoryFact[] = []) {
    super();
  }

  ofOrders(orderIds: readonly string[]): Promise<ReadonlyMap<string, OrderHandoverHistoryFact>> {
    this.asked.push(orderIds);
    return Promise.resolve(
      new Map(
        this.facts.filter((fact) => orderIds.includes(fact.orderId)).map((f) => [f.orderId, f]),
      ),
    );
  }
}

class FixedStops extends OrderDeliveryHistoryReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly facts: readonly OrderDeliveryStopFact[] = []) {
    super();
  }

  ofOrders(orderIds: readonly string[]): Promise<readonly OrderDeliveryStopFact[]> {
    this.asked.push(orderIds);
    return Promise.resolve(this.facts.filter((fact) => orderIds.includes(fact.orderId)));
  }
}

/** Les entités en service, telles quelles. */
class FixedIssuers extends InvoiceIssuersReader {
  constructor(private readonly issuers: readonly InvoiceSellerFacts[]) {
    super();
  }

  activeIssuers(): Promise<readonly InvoiceSellerFacts[]> {
    return Promise.resolve(this.issuers);
  }
}

/** Les payeurs connus ; retient les sociétés demandées. */
class FixedBuyers extends StatementBuyerReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly buyers: readonly StatementBuyer[]) {
    super();
  }

  buyersOf(companyIds: readonly string[]): Promise<ReadonlyMap<string, StatementBuyer>> {
    this.asked.push(companyIds);
    return Promise.resolve(
      new Map(
        this.buyers.filter((b) => companyIds.includes(b.companyId)).map((b) => [b.companyId, b]),
      ),
    );
  }
}

/** Une entité complète, mentions comprises : elle ne bloque rien. */
const COMPLETE_SELLER: InvoiceSellerFacts = {
  legalEntityId: "le1",
  name: "La Folie Douce SAS",
  legalForm: "SAS",
  rcs: "Paris B 123 456 789",
  vatNumber: "FR12123456789",
  archived: false,
  paymentTerms: InvoicePaymentTerms.create({
    latePenaltyRateBasisPoints: 1_415,
    recoveryIndemnityCents: 4_000,
    earlyPaymentDiscount: "néant",
  }),
};

const COMPLETE_BUYER: StatementBuyer = {
  companyId: "c1",
  name: "Maison mère",
  legalForm: "SARL",
  siret: "73282932000074",
  siren: "732829320",
  vatNumber: "FR44732829320",
  billingAddressLines: ["1 rue du Four", "75001 Paris"],
};

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
): InvoiceDossierOrder {
  return {
    orderId: `id-${order.reference}`,
    companyId,
    billedCompanyId,
    order,
    place: { method: "pickup", label: "Labo", address: "1 rue du Four, 75001 Paris" },
  };
}

const SITE_FOLLOW: BillingFollow = {
  companyId: "site",
  payerId: "c1",
  payerName: "Maison mère",
  validFrom: new Date("2026-01-01T00:00:00.000Z"),
  validTo: null,
};

function getHandler(
  reader: InvoiceDossierReader,
  billing = new FixedBilling(),
  handovers = new FixedHandovers(),
  stops = new FixedStops(),
  issuers = new FixedIssuers([COMPLETE_SELLER]),
  buyers = new FixedBuyers([COMPLETE_BUYER]),
) {
  return new GetInvoiceDossierHandler(
    reader,
    billing,
    handovers,
    stops,
    new FixedClock(NOW),
    issuers,
    buyers,
  );
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

  it("ne signale aucun manque quand le vendeur et le payeur sont complets", async () => {
    const buyers = new FixedBuyers([COMPLETE_BUYER]);
    const view = await getHandler(
      new RecordingDossiers("Maison mère", []),
      new FixedBilling(),
      new FixedHandovers(),
      new FixedStops(),
      new FixedIssuers([COMPLETE_SELLER]),
      buyers,
    ).execute(new GetInvoiceDossierQuery("c1", "2026-09"));

    expect(view.issuanceBlockers).toEqual([]);
    expect(buyers.asked).toEqual([["c1"]]);
  });

  it("liste ce qui empêcherait d'émettre : mentions absentes, payeur sans SIREN ni TVA", async () => {
    const view = await getHandler(
      new RecordingDossiers("Maison mère", []),
      new FixedBilling(),
      new FixedHandovers(),
      new FixedStops(),
      new FixedIssuers([{ ...COMPLETE_SELLER, paymentTerms: InvoicePaymentTerms.empty() }]),
      new FixedBuyers([{ ...COMPLETE_BUYER, siren: "", vatNumber: "" }]),
    ).execute(new GetInvoiceDossierQuery("c1", "2026-09"));

    expect(view.issuanceBlockers.map((blocker) => blocker.code)).toEqual([
      "payment_terms_missing",
      "buyer_siren_missing",
      "buyer_vat_missing",
    ]);
  });

  it("dit qu'aucune entité n'émet, et qu'un payeur absent de l'annuaire n'a pas d'acheteur", async () => {
    const view = await getHandler(
      new RecordingDossiers("Maison mère", []),
      new FixedBilling(),
      new FixedHandovers(),
      new FixedStops(),
      new FixedIssuers([]),
      new FixedBuyers([]),
    ).execute(new GetInvoiceDossierQuery("c1", "2026-09"));

    expect(view.issuanceBlockers.map((blocker) => blocker.code)).toEqual([
      "no_issuer",
      "buyer_unknown",
    ]);
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

  it("lit l'historique de tous les bons en UN lot par bloc, et signale le bon jamais retiré", async () => {
    const reader = new RecordingDossiers("Maison mère", [
      entry("c1", bon("CMD-1", "2026-09-14")),
      entry("c1", bon("CMD-2", "2026-09-15")),
      entry("c1", bon("CMD-3", "2026-09-16")),
    ]);
    const handovers = new FixedHandovers([
      {
        orderId: "id-CMD-1",
        handedOverAt: new Date("2026-09-14T07:30:00.000Z"),
        via: "scan",
        atDoor: false,
      },
      {
        orderId: "id-CMD-2",
        handedOverAt: new Date("2026-09-16T09:00:00.000Z"),
        via: "manual",
        atDoor: true,
      },
    ]);
    // CMD-2 : rapporté le 15, replacé et livré le 16.
    const stops = new FixedStops([
      {
        orderId: "id-CMD-2",
        serviceDay: "2026-09-15",
        placedAt: new Date("2026-09-14T15:00:00.000Z"),
        departedAt: new Date("2026-09-15T06:00:00.000Z"),
        closedAt: new Date("2026-09-15T08:00:00.000Z"),
        broughtBackAt: new Date("2026-09-15T08:00:00.000Z"),
      },
      {
        orderId: "id-CMD-2",
        serviceDay: "2026-09-16",
        placedAt: new Date("2026-09-15T14:00:00.000Z"),
        departedAt: new Date("2026-09-16T06:00:00.000Z"),
        closedAt: new Date("2026-09-16T09:00:00.000Z"),
        broughtBackAt: null,
      },
    ]);
    const view = await getHandler(reader, new FixedBilling(), handovers, stops).execute(
      new GetInvoiceDossierQuery("c1", "2026-09"),
    );

    expect(handovers.asked).toEqual([["id-CMD-1", "id-CMD-2", "id-CMD-3"]]);
    expect(stops.asked).toEqual([["id-CMD-1", "id-CMD-2", "id-CMD-3"]]);
    expect(view.neverHandedOver).toEqual(["CMD-3"]);
    expect(view.orders[0]?.history).toEqual([
      { kind: "handed_over", at: "2026-09-14T07:30:00.000Z", serviceDay: null, via: "scan" },
    ]);
    expect(view.orders[0]?.place).toEqual({
      method: "pickup",
      label: "Labo",
      address: "1 rue du Four, 75001 Paris",
    });
    expect(view.orders[1]?.history.map((event) => event.kind)).toEqual([
      "departed",
      "brought_back",
      "replaced",
      "departed",
      "handed_over_at_door",
    ]);
    expect(view.orders[1]?.actualDeliveryDay).toBe("2026-09-16");
    expect(view.orders[2]?.history).toEqual([]);
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
  const handler = new ExportInvoiceDossierHandler(
    reader,
    new FixedBilling(),
    new FixedHandovers([
      {
        orderId: "id-CMD-1",
        handedOverAt: new Date("2026-09-14T07:30:00.000Z"),
        via: "scan",
        atDoor: false,
      },
    ]),
    new FixedStops(),
    new FixedClock(NOW),
  );

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
    expect(file.csv).toContain('"Facturés sans aucun fait de retrait : CMD-2"');
    expect(file.csv).toContain('"Retrait — Labo, 1 rue du Four, 75001 Paris"');
    expect(file.csv).toContain('"retiré au comptoir 2026-09-14T07:30:00.000Z (scan)"');
  });

  it("rend les écarts, et leur somme", async () => {
    const file = await handler.execute(new ExportInvoiceDossierQuery("c1", "2026-09", "gaps"));

    expect(file.fileName).toBe("DOSSIER-ECARTS-Maison mère-2026-09.csv");
    expect(file.csv).toContain('"Total";"total facture − Σ bons"');
  });
});

import type { BillingFollow } from "../../ports/statement-billing.reader.js";
import { StatementMonth } from "../../value-objects/statement-month.js";
import {
  deliveredOnOf,
  invoicePaymentMeansOf,
  invoicingMomentOf,
  lastDayOf,
  monthToInvoice,
  planMonthlyInvoices,
  type InvoiceableOrder,
} from "../monthly-invoicing.js";
import { ENTITY_ID, frozenOrder, mandate } from "./collection-fixtures.js";

/**
 * La facture du mois, sa partie pure (lot E4). Les dates sont le SUJET des
 * tests et ne sont comparées qu'entre elles : aucune horloge n'est lue.
 */

const SEPTEMBER = StatementMonth.parse("2026-09");
/** 30 septembre 2026, 22h à Paris (heure d'été, UTC+2). */
const SEPTEMBER_MOMENT = new Date("2026-09-30T20:00:00.000Z");

let seq = 0;
function bon(companyId: string, overrides: Partial<InvoiceableOrder> = {}): InvoiceableOrder {
  seq += 1;
  const orderNumber = `CMD-${String(seq).padStart(3, "0")}`;
  const placedAt = new Date("2026-09-15T08:00:00.000Z");
  return {
    orderId: `o${String(seq)}`,
    orderNumber,
    companyId,
    placedAt,
    billedCompanyId: null,
    frozen: frozenOrder(orderNumber, placedAt),
    ...overrides,
  };
}

const CHALET_FOLLOWS_PRINCIPAL: BillingFollow = {
  companyId: "c_chalet",
  payerId: "c_principal",
  payerName: "Club Principal",
  validFrom: new Date("2026-08-01T00:00:00.000Z"),
  validTo: null,
};

describe("quand la facture du mois s'émet", () => {
  it("le dernier jour du mois, à 22h heure de Paris", () => {
    expect(lastDayOf(SEPTEMBER)).toBe("2026-09-30");
    expect(invoicingMomentOf(SEPTEMBER)).toEqual(SEPTEMBER_MOMENT);
    // Février d'une année non bissextile, à l'heure d'hiver (UTC+1).
    const february = StatementMonth.parse("2027-02");
    expect(lastDayOf(february)).toBe("2027-02-28");
    expect(invoicingMomentOf(february)).toEqual(new Date("2027-02-28T21:00:00.000Z"));
  });

  it("le mois à facturer est le dernier dont l'heure est passée", () => {
    expect(monthToInvoice(new Date(SEPTEMBER_MOMENT.getTime() - 1)).toString()).toBe("2026-08");
    expect(monthToInvoice(SEPTEMBER_MOMENT).toString()).toBe("2026-09");
    // Le 8 octobre : septembre, tant que le 31 octobre 22h n'est pas atteint.
    expect(monthToInvoice(new Date("2026-10-08T09:00:00.000Z")).toString()).toBe("2026-09");
  });
});

describe("planMonthlyInvoices — une facture par payeur légal", () => {
  it("le bon d'un site qui suit sa facturation va au principal (Q3)", () => {
    const chalet = bon("c_chalet");
    const principal = bon("c_principal");
    const port = bon("c_port");

    const plan = planMonthlyInvoices(
      [chalet, principal, port],
      [CHALET_FOLLOWS_PRINCIPAL],
      new Set(),
    );

    expect(
      plan.payers.map((payer) => [payer.payerId, payer.billable.map((o) => o.orderId)]),
    ).toEqual([
      ["c_principal", [chalet.orderId, principal.orderId]],
      ["c_port", [port.orderId]],
    ]);
  });

  it("le payeur copié à la passation l'emporte sur la résolution à date", () => {
    const copied = bon("c_chalet", { billedCompanyId: "c_port" });

    const plan = planMonthlyInvoices([copied], [CHALET_FOLLOWS_PRINCIPAL], new Set());

    expect(plan.payers.map((payer) => payer.payerId)).toEqual(["c_port"]);
  });

  it("un bon non facturable est mis à part, pas sur la facture", () => {
    const good = bon("c_port");
    const broken = bon("c_port");
    const unbillable = {
      ...broken,
      frozen: { ...broken.frozen, lateFeeCents: 100, lateFeeVatRate: null },
    };

    const [payer] = planMonthlyInvoices([good, unbillable], [], new Set()).payers;

    expect(payer?.billable.map((o) => o.orderId)).toEqual([good.orderId]);
    expect(payer?.unbillable.map((o) => o.orderId)).toEqual([unbillable.orderId]);
  });

  it("un payeur déjà facturé pour le mois n'est pas repris", () => {
    const plan = planMonthlyInvoices([bon("c_port"), bon("c_quai")], [], new Set(["c_port"]));

    expect(plan.payers.map((payer) => payer.payerId)).toEqual(["c_quai"]);
    expect(plan.alreadyInvoiced).toEqual(["c_port"]);
  });
});

describe("invoicePaymentMeansOf — le moyen de paiement figé (BG-16)", () => {
  const context = {
    legalEntityId: ENTITY_ID,
    follows: [CHALET_FOLLOWS_PRINCIPAL],
    mandates: [mandate("c_principal")],
    collectionForms: new Map(),
  };

  it("prélèvement SEPA, sous le mandat effectif du payeur", () => {
    expect(invoicePaymentMeansOf([bon("c_principal"), bon("c_chalet")], context)).toEqual({
      code: "59",
      mandateReference: "RUM-c_principal",
    });
  });

  it("rien quand les bons tombent sur deux mandats (site sur son propre mandat)", () => {
    const split = {
      ...context,
      mandates: [
        mandate("c_principal"),
        mandate("c_chalet", { debtorCompanyId: "c_principal", reference: "RUM-chalet" }),
      ],
      collectionForms: new Map([["c_chalet", "own_mandate_principal_iban" as const]]),
    };

    expect(invoicePaymentMeansOf([bon("c_principal"), bon("c_chalet")], split)).toBeNull();
  });

  it("rien sans mandat, ou sous le mandat d'une autre entité", () => {
    expect(invoicePaymentMeansOf([bon("c_port")], context)).toBeNull();
    const elsewhere = { ...context, mandates: [mandate("c_principal", { creditorId: "le_2" })] };
    expect(invoicePaymentMeansOf([bon("c_principal")], elsewhere)).toBeNull();
  });
});

describe("deliveredOnOf — la date de livraison réelle", () => {
  const handedOverAt = new Date("2026-09-30T21:30:00.000Z");

  it("jamais retiré : aucune date", () => {
    expect(deliveredOnOf(null, [])).toBeNull();
  });

  it("au comptoir : le jour du retrait, à Paris", () => {
    // 23h30 à Paris : encore le 30, pas le 1er de l'heure UTC… ni le 30 UTC par hasard.
    expect(deliveredOnOf({ handedOverAt, via: "scan", atDoor: false }, [])).toBe("2026-09-30");
    expect(
      deliveredOnOf(
        { handedOverAt: new Date("2026-09-30T22:30:00.000Z"), via: "scan", atDoor: false },
        [],
      ),
    ).toBe("2026-10-01");
  });

  it("à la porte : le jour de la tournée qui l'a livré", () => {
    const stop = {
      serviceDay: "2026-09-29",
      placedAt: new Date("2026-09-28T10:00:00.000Z"),
      departedAt: new Date("2026-09-29T05:00:00.000Z"),
      closedAt: new Date("2026-09-29T09:00:00.000Z"),
      broughtBackAt: null,
    };
    expect(deliveredOnOf({ handedOverAt, via: "scan", atDoor: true }, [stop])).toBe("2026-09-29");
  });
});

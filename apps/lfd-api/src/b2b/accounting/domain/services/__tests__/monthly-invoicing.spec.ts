import type { BillingFollow } from "../../ports/statement-billing.reader.js";
import { StatementMonth } from "../../value-objects/statement-month.js";
import {
  deliveredOnOf,
  invoiceGroupKey,
  invoicePaymentMeansOf,
  invoicingMomentOf,
  lastDayOf,
  monthToInvoice,
  ordersByPayer,
  planMonthlyInvoices,
  type InvoiceableOrder,
  type MandateContext,
} from "../monthly-invoicing.js";
import { ENTITY_ID, frozenOrder, mandate } from "./collection-fixtures.js";

/**
 * La facture du mois, sa partie pure (lot E4). Les dates sont le SUJET des
 * tests et ne sont comparées qu'entre elles : aucune horloge n'est lue.
 */

const SEPTEMBER = StatementMonth.parse("2026-09");
/** 30 septembre 2026, 23h55 à Paris (heure d'été, UTC+2) — E4b. */
const SEPTEMBER_MOMENT = new Date("2026-09-30T21:55:00.000Z");

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

function unbillable(order: InvoiceableOrder): InvoiceableOrder {
  return { ...order, frozen: { ...order.frozen, lateFeeCents: 100, lateFeeVatRate: null } };
}

const CHALET_FOLLOWS_PRINCIPAL: BillingFollow = {
  companyId: "c_chalet",
  payerId: "c_principal",
  payerName: "Club Principal",
  validFrom: new Date("2026-08-01T00:00:00.000Z"),
  validTo: null,
};

/** Le principal sur son mandat ; le chalet sur le SIEN (forme 2), au nom du principal. */
const TWO_MANDATES: MandateContext = {
  legalEntityId: ENTITY_ID,
  follows: [CHALET_FOLLOWS_PRINCIPAL],
  mandates: [
    mandate("c_principal"),
    mandate("c_chalet", { debtorCompanyId: "c_principal", reference: "RUM-chalet" }),
  ],
  collectionForms: new Map([["c_chalet", "own_mandate_principal_iban" as const]]),
};

const ONE_MANDATE: MandateContext = {
  ...TWO_MANDATES,
  mandates: [mandate("c_principal")],
  collectionForms: new Map(),
};

function plan(
  orders: readonly InvoiceableOrder[],
  context: MandateContext = ONE_MANDATE,
  already: ReadonlySet<string> = new Set(),
) {
  return planMonthlyInvoices(ordersByPayer(orders, context.follows), context, already);
}

describe("quand la facture du mois s'émet", () => {
  it("le dernier jour du mois, à 23h55 heure de Paris (E4b)", () => {
    expect(lastDayOf(SEPTEMBER)).toBe("2026-09-30");
    expect(invoicingMomentOf(SEPTEMBER)).toEqual(SEPTEMBER_MOMENT);
    // Février d'une année non bissextile, à l'heure d'hiver (UTC+1).
    const february = StatementMonth.parse("2027-02");
    expect(lastDayOf(february)).toBe("2027-02-28");
    expect(invoicingMomentOf(february)).toEqual(new Date("2027-02-28T22:55:00.000Z"));
  });

  it("le mois à facturer est le dernier dont l'heure est passée", () => {
    expect(monthToInvoice(new Date(SEPTEMBER_MOMENT.getTime() - 1)).toString()).toBe("2026-08");
    expect(monthToInvoice(SEPTEMBER_MOMENT).toString()).toBe("2026-09");
    // Le 8 octobre : septembre, tant que le 31 octobre 23h55 n'est pas atteint.
    expect(monthToInvoice(new Date("2026-10-08T09:00:00.000Z")).toString()).toBe("2026-09");
  });

  /** Régression E4b : à 22h le dernier jour, on émettait déjà ; plus avant 23h55. */
  it("à 22h le dernier jour, le mois court encore", () => {
    expect(monthToInvoice(new Date("2026-09-30T20:00:00.000Z")).toString()).toBe("2026-08");
  });
});

describe("ordersByPayer — les bons par payeur légal", () => {
  it("le bon d'un site qui suit sa facturation va au principal (Q3)", () => {
    const chalet = bon("c_chalet");
    const principal = bon("c_principal");
    const port = bon("c_port");

    const payers = ordersByPayer([chalet, principal, port], [CHALET_FOLLOWS_PRINCIPAL]);

    expect(payers.map((payer) => [payer.payerId, payer.orders.map((o) => o.orderId)])).toEqual([
      ["c_principal", [chalet.orderId, principal.orderId]],
      ["c_port", [port.orderId]],
    ]);
  });

  it("le payeur copié à la passation l'emporte sur la résolution à date", () => {
    const copied = bon("c_chalet", { billedCompanyId: "c_port" });

    const payers = ordersByPayer([copied], [CHALET_FOLLOWS_PRINCIPAL]);

    expect(payers.map((payer) => payer.payerId)).toEqual(["c_port"]);
  });
});

describe("planMonthlyInvoices — une facture par payeur légal et par mandat (E4b)", () => {
  /**
   * Hugo, 2026-10-09 : « même automatique, pas de facture si pas de commande ».
   * Les payeurs naissent des bons du mois : un client sans commande n'est ni
   * facturé ni signalé, quelle que soit sa fiche (adresse, mandat).
   */
  it("sans aucun bon du mois : ni facture, ni payeur signalé", () => {
    const result = plan([]);

    expect(result.invoices).toEqual([]);
    expect(result.alreadyInvoiced).toEqual([]);
  });

  it("un payeur sur un seul mandat : une facture, sous ce mandat", () => {
    const chalet = bon("c_chalet");
    const principal = bon("c_principal");

    const { invoices } = plan([chalet, principal]);

    expect(
      invoices.map((i) => [i.payerId, i.mandate?.reference, i.billable.map((o) => o.orderId)]),
    ).toEqual([["c_principal", "RUM-c_principal", [chalet.orderId, principal.orderId]]]);
  });

  it("des bons sur deux mandats : deux factures, au même payeur légal", () => {
    const chalet = bon("c_chalet");
    const principal = bon("c_principal");
    const chaletAgain = bon("c_chalet");

    const { invoices } = plan([chalet, principal, chaletAgain], TWO_MANDATES);

    expect(
      invoices.map((i) => [i.payerId, i.mandate?.reference, i.billable.map((o) => o.orderId)]),
    ).toEqual([
      ["c_principal", "RUM-chalet", [chalet.orderId, chaletAgain.orderId]],
      ["c_principal", "RUM-c_principal", [principal.orderId]],
    ]);
  });

  it("l'ordre est déterministe : payeurs par premier bon, puis factures par premier bon", () => {
    const port = bon("c_port");
    const principal = bon("c_principal");
    const chalet = bon("c_chalet");
    const context = { ...TWO_MANDATES, mandates: [...TWO_MANDATES.mandates, mandate("c_port")] };

    const first = plan([port, principal, chalet], context).invoices;
    const again = plan([port, principal, chalet], context).invoices;

    const order = (invoices: typeof first) =>
      invoices.map((i) => invoiceGroupKey(i.payerId, i.mandate?.mandateId ?? null));
    expect(order(first)).toEqual([
      "c_port|m_c_port",
      "c_principal|m_c_principal",
      "c_principal|m_c_chalet",
    ]);
    expect(order(again)).toEqual(order(first));
  });

  it("les bons sans mandat effectif font leur propre facture, sans mandat", () => {
    const principal = bon("c_principal");
    const port = bon("c_port");

    const { invoices } = plan([principal, port]);

    expect(invoices.map((i) => [i.payerId, i.mandate])).toEqual([
      ["c_principal", ONE_MANDATE.mandates[0]],
      ["c_port", null],
    ]);
  });

  it("un mandat d'une autre entité ne compte pas : facture sans mandat", () => {
    const elsewhere = {
      ...ONE_MANDATE,
      mandates: [mandate("c_principal", { creditorId: "le_2" })],
    };

    const { invoices } = plan([bon("c_principal")], elsewhere);

    expect(invoices.map((i) => i.mandate)).toEqual([null]);
  });

  it("un bon non facturable est mis à part, dans la facture de SON mandat", () => {
    const good = bon("c_principal");
    const broken = unbillable(bon("c_chalet"));

    const { invoices } = plan([good, broken], TWO_MANDATES);

    expect(invoices.map((i) => [i.mandate?.reference, i.billable.length, i.unbillable])).toEqual([
      ["RUM-c_principal", 1, []],
      ["RUM-chalet", 0, [broken]],
    ]);
  });

  it("une facture déjà émise pour le mois n'est pas reprise ; l'autre mandat l'est", () => {
    const already = new Set([invoiceGroupKey("c_principal", "m_c_principal")]);

    const result = plan([bon("c_principal"), bon("c_chalet")], TWO_MANDATES, already);

    expect(result.invoices.map((i) => i.mandate?.reference)).toEqual(["RUM-chalet"]);
    expect(result.alreadyInvoiced).toEqual(["c_principal|m_c_principal"]);
  });
});

describe("invoicePaymentMeansOf — le moyen de paiement figé (BG-16)", () => {
  it("prélèvement SEPA, sous le mandat de la facture", () => {
    expect(invoicePaymentMeansOf(mandate("c_principal"))).toEqual({
      code: "59",
      mandateReference: "RUM-c_principal",
    });
  });

  it("rien sans mandat", () => {
    expect(invoicePaymentMeansOf(null)).toBeNull();
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

import type { CollectableOrder } from "../../ports/collection-candidates.reader.js";
import type { CollectionMeans } from "../../value-objects/collection-means.js";
import {
  assembleCollection,
  type AssemblyInput,
  type CollectableInvoice,
} from "../collection-assembly.js";
import { ENTITY_ID, SEPTEMBER, mandate, order } from "./collection-fixtures.js";

/**
 * **Le lot lit le moyen de la facture, bon par bon** (plan
 * `plan-paiement-au-compte-par-virement.md`, K2, K9). Les dates ne sont
 * comparées qu'entre elles : aucune horloge n'est lue.
 */

const AT = new Date("2026-10-02T09:00:00.000Z");

function input(overrides: Partial<AssemblyInput>): AssemblyInput {
  return {
    legalEntityId: ENTITY_ID,
    at: AT,
    payerPeriodStartsAt: () => SEPTEMBER.startsAt,
    // Le payeur est AUJOURD'HUI au virement : seul ce que la facture a figé compte.
    statementMeansOf: () => "bank_transfer",
    orders: [],
    follows: [],
    mandates: [mandate("c_port")],
    collectionForms: new Map(),
    consumedMandates: new Set(),
    companyNames: new Map([
      ["c_port", "Boulangerie du Port"],
      ["c_quai", "Café du Quai"],
    ]),
    liveSchemes: [],
    invoices: new Map(),
    invoicingFloor: SEPTEMBER.startsAt,
    ...overrides,
  };
}

function invoice(
  number: string,
  orders: readonly CollectableOrder[],
  means: CollectionMeans,
): CollectableInvoice {
  return {
    invoiceId: `inv_${number}`,
    number,
    totalCents: 1_000 * orders.length,
    orderIds: orders.map((o) => o.orderId),
    means,
  };
}

function byOrder(invoices: readonly CollectableInvoice[]): ReadonlyMap<string, CollectableInvoice> {
  return new Map(invoices.flatMap((inv) => inv.orderIds.map((id) => [id, inv] as const)));
}

describe("assembleCollection — le moyen figé sur la facture (K2)", () => {
  it("une facture au virement n'est ni prélevée, ni écartée, ni comptée « sans mandat »", () => {
    const bon = order("c_quai");
    const transfer = invoice("FA-LFD-2026-000001", [bon], "bank_transfer");

    const result = assembleCollection(
      input({ orders: [bon], invoices: byOrder([transfer]), mandates: [] }),
    );

    expect(result.debits.size).toBe(0);
    expect(result.exclusions).toEqual([]);
    expect(result.unmandatedCompanies).toEqual([]);
  });

  it("une facture au prélèvement d'un payeur passé au virement depuis est prélevée : la facture fait foi", () => {
    const bon = order("c_port");
    const debit = invoice("FA-LFD-2026-000001", [bon], "sepa_debit");

    const { debits } = assembleCollection(input({ orders: [bon], invoices: byOrder([debit]) }));

    const [line] = debits.get("B2B") ?? [];
    expect(line?.settles).toEqual({ kind: "invoices", invoices: [debit] });
  });

  it("bon par bon : des deux factures du même payeur, seule celle au prélèvement est prélevée", () => {
    const [old, fresh] = [order("c_port"), order("c_port")];
    const debit = invoice("FA-LFD-2026-000001", [old], "sepa_debit");
    const transfer = invoice("FA-LFD-2026-000002", [fresh], "bank_transfer");

    const { debits, exclusions } = assembleCollection(
      input({ orders: [old, fresh], invoices: byOrder([debit, transfer]) }),
    );

    expect((debits.get("B2B") ?? []).flatMap((line) => line.orders.map((o) => o.orderId))).toEqual([
      old.orderId,
    ]);
    expect(exclusions).toEqual([]);
  });

  it("un payeur revenu au prélèvement : le bon de sa facture au virement n'est PAS prélevé", () => {
    const bon = order("c_port");
    const transfer = invoice("FA-LFD-2026-000001", [bon], "bank_transfer");

    const { debits } = assembleCollection(
      input({
        orders: [bon],
        invoices: byOrder([transfer]),
        statementMeansOf: () => "sepa_debit",
      }),
    );

    expect(debits.size).toBe(0);
  });
});

describe("assembleCollection — les bons sans facture lisent le moyen de la période de leur solde (K9)", () => {
  it("soldé dans une période au virement : pas d'arrêté, ni écarté, ni « sans mandat »", () => {
    const transferred = order("c_quai", { settledOn: "2026-09-20" });
    const debited = order("c_port", { settledOn: "2026-08-20" });
    const meansOn = (_payer: string, settledOn: string): CollectionMeans =>
      settledOn >= "2026-09-01" ? "bank_transfer" : "sepa_debit";

    const result = assembleCollection(
      input({ orders: [transferred, debited], invoicingFloor: null, statementMeansOf: meansOn }),
    );

    expect(
      (result.debits.get("B2B") ?? []).map((line) => [
        line.settles.kind,
        line.orders.map((o) => o.orderId),
      ]),
    ).toEqual([["statement", [debited.orderId]]]);
    expect(result.exclusions).toEqual([]);
    expect(result.unmandatedCompanies).toEqual([]);
  });
});

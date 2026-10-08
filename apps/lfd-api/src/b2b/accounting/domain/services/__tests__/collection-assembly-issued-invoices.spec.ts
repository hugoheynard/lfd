import type { CollectableOrder } from "../../ports/collection-candidates.reader.js";
import {
  assembleCollection,
  type AssemblyInput,
  type CollectableInvoice,
} from "../collection-assembly.js";
import { renderBatchFile } from "../collection-batch-file.js";
import { BATCH_ID, CREDITOR, ENTITY_ID, SEPTEMBER, mandate, order } from "./collection-fixtures.js";

/**
 * Le lot encaisse des factures émises (plan `plan-emission-de-la-facture.md`,
 * § 3, lot E4). Les dates ne sont comparées qu'entre elles et au cycle :
 * aucune horloge n'est lue.
 */

const AT = new Date("2026-10-02T09:00:00.000Z");
/** La mise en service de la facture du mois : le 1er septembre. */
const FLOOR = SEPTEMBER.startsAt;
const BEFORE_FLOOR = new Date("2026-08-20T08:00:00.000Z");

function input(overrides: Partial<AssemblyInput>): AssemblyInput {
  return {
    legalEntityId: ENTITY_ID,
    at: AT,
    cycleStartsAt: SEPTEMBER.startsAt,
    orders: [],
    follows: [],
    mandates: [mandate("c_port"), mandate("c_quai")],
    collectionForms: new Map(),
    consumedMandates: new Set(),
    companyNames: new Map([
      ["c_port", "Boulangerie du Port"],
      ["c_quai", "Café du Quai"],
    ]),
    liveSchemes: [],
    invoices: new Map(),
    invoicingFloor: FLOOR,
    ...overrides,
  };
}

function invoice(
  number: string,
  orders: readonly CollectableOrder[],
  totalCents: number,
): CollectableInvoice {
  return {
    invoiceId: `inv_${number}`,
    number,
    totalCents,
    orderIds: orders.map((o) => o.orderId),
  };
}

function byOrder(invoices: readonly CollectableInvoice[]): ReadonlyMap<string, CollectableInvoice> {
  return new Map(invoices.flatMap((inv) => inv.orderIds.map((id) => [id, inv] as const)));
}

describe("assembleCollection — le lot encaisse des factures émises (E4)", () => {
  it("une ligne regroupe les factures du payeur ; son montant est Σ TTC des factures", () => {
    const [a, b, c] = [order("c_port"), order("c_port"), order("c_port")];
    // Des totaux qui ne sont PAS la somme des bons : rien n'est recalculé.
    const first = invoice("FA-2026-000002", [a, b], 1_999);
    const second = invoice("FA-2026-000001", [c], 1_001);

    const { debits, exclusions } = assembleCollection(
      input({ orders: [a, b, c], invoices: byOrder([first, second]) }),
    );

    const [line] = debits.get("B2B") ?? [];
    expect(line?.settles).toEqual({ kind: "invoices", invoices: [second, first] });
    expect(line?.amountCents).toBe(3_000);
    expect(line?.ordersTotalCents).toBe(3_000);
    expect(line?.orders.map((o) => o.orderId)).toEqual([a.orderId, b.orderId, c.orderId]);
    expect(exclusions).toEqual([]);
  });

  it("un bon passé depuis la mise en service, sans facture, attend la sienne", () => {
    const waiting = order("c_port");

    const { debits, exclusions } = assembleCollection(input({ orders: [waiting] }));

    expect(debits.size).toBe(0);
    expect(exclusions).toEqual([]);
  });

  it("un bon d'avant la mise en service garde l'arrêté ; jamais sur la même ligne qu'une facture", () => {
    const old = order("c_port", { placedAt: BEFORE_FLOOR });
    const fresh = order("c_port");
    const issued = invoice("FA-2026-000001", [fresh], 1_000);

    const { debits } = assembleCollection(
      input({ orders: [old, fresh], invoices: byOrder([issued]) }),
    );

    const kinds = (debits.get("B2B") ?? []).map((draft) => [
      draft.settles.kind,
      draft.orders.map((o) => o.orderId),
    ]);
    expect(kinds).toEqual(
      expect.arrayContaining([
        ["statement", [old.orderId]],
        ["invoices", [fresh.orderId]],
      ]),
    );
  });

  it("sans plancher, un bon facturé suit quand même sa facture — jamais un arrêté de plus", () => {
    const fresh = order("c_port");
    const issued = invoice("FA-2026-000001", [fresh], 1_000);

    const { debits } = assembleCollection(
      input({ orders: [fresh], invoices: byOrder([issued]), invoicingFloor: null }),
    );

    expect((debits.get("B2B") ?? []).map((draft) => draft.settles.kind)).toEqual(["invoices"]);
  });

  it("une facture dont les bons tombent sur deux mandats est écartée entière (`invoice_split`)", () => {
    const own = order("c_port");
    const site = order("c_chalet", { billedCompanyId: "c_port" });
    const issued = invoice("FA-2026-000001", [own, site], 2_000);

    const { debits, exclusions } = assembleCollection(
      input({
        orders: [own, site],
        invoices: byOrder([issued]),
        mandates: [
          mandate("c_port"),
          mandate("c_chalet", { debtorCompanyId: "c_port", reference: "RUM-chalet" }),
        ],
        collectionForms: new Map([["c_chalet", "own_iban" as const]]),
        follows: [
          {
            companyId: "c_chalet",
            payerId: "c_port",
            payerName: "Boulangerie du Port",
            validFrom: new Date("2026-08-01T00:00:00.000Z"),
            validTo: null,
          },
        ],
      }),
    );

    expect(debits.size).toBe(0);
    expect(exclusions.map((e) => [e.order.orderId, e.reason])).toEqual([
      [own.orderId, "invoice_split"],
      [site.orderId, "invoice_split"],
    ]);
  });

  it("un bon écarté écarte toute sa facture, pour la même raison", () => {
    const [a, b] = [order("c_none"), order("c_none")];
    const issued = invoice("FA-2026-000001", [a, b], 2_000);

    const { exclusions, unmandatedCompanies } = assembleCollection(
      input({ orders: [a, b], invoices: byOrder([issued]) }),
    );

    expect(exclusions.map((e) => e.reason)).toEqual(["no_mandate", "no_mandate"]);
    expect(unmandatedCompanies).toEqual(["c_none"]);
  });

  it("une facture dont un bon n'est plus à prélever (réglé autrement) attend : pas de morceau", () => {
    const [a, b] = [order("c_port"), order("c_port")];
    const issued = invoice("FA-2026-000001", [a, b], 2_000);

    // `b` n'est plus parmi les bons ouverts : seul `a` est lu.
    const { debits, exclusions } = assembleCollection(
      input({ orders: [a], invoices: byOrder([issued]) }),
    );

    expect(debits.size).toBe(0);
    expect(exclusions).toEqual([]);
  });
});

describe("renderBatchFile — la ligne cite ses factures", () => {
  it("porte les factures, et le RmtInf les nomme", () => {
    const [a, b] = [order("c_port"), order("c_quai")];
    const port = invoice("FA-2026-000001", [a], 1_000);
    const quai = invoice("FA-2026-000002", [b], 1_000);
    const { debits } = assembleCollection(
      input({ orders: [a, b], invoices: byOrder([port, quai]) }),
    );

    const file = renderBatchFile({
      batchId: BATCH_ID,
      creditor: CREDITOR,
      scheme: "B2B",
      cycle: SEPTEMBER,
      constitutedAt: AT,
      debits: debits.get("B2B") ?? [],
      unmandatedCompanies: [],
      requestedCollectionDay: "2026-10-16",
    });

    expect(file.lines.map((line) => line.invoices)).toEqual([
      [{ invoiceId: port.invoiceId, number: port.number }],
      [{ invoiceId: quai.invoiceId, number: quai.number }],
    ]);
    expect(file.xml).toContain("<Ustrd>Facture FA-2026-000001</Ustrd>");
  });
});

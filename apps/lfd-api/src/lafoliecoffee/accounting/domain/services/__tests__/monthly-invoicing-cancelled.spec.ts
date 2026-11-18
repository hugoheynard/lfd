import {
  groupOrderIds,
  withoutCancelled,
  withoutMovedCommitments,
} from "../invoice-group-under-lock.js";
import {
  invoiceGroupKey,
  type InvoiceableOrder,
  type PayerInvoicePlan,
} from "../monthly-invoicing.js";
import { frozenOrder, mandate } from "./collection-fixtures.js";

/**
 * Le groupe d'une facture moins ses commandes annulées (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C5.3). Les dates ne sont comparées
 * à rien : aucune horloge n'est lue.
 */

const PLACED = new Date("2026-09-15T08:00:00.000Z");

function bon(id: string): InvoiceableOrder {
  return {
    orderId: id,
    orderNumber: `ORD-${id}`,
    companyId: "c_port",
    placedAt: PLACED,
    receivedOn: "2026-09-16",
    billedCompanyId: null,
    frozen: frozenOrder(`ORD-${id}`, PLACED),
    deliveryNoteNumbers: [],
    budgetCommitment: null,
  };
}

const GROUP: PayerInvoicePlan = {
  payerId: "c_port",
  means: "sepa_debit",
  mandate: mandate("c_port"),
  budgetCommitment: null,
  billable: [bon("a"), bon("b")],
  unbillable: [bon("z")],
};

describe("withoutCancelled — retirer, rien d'autre", () => {
  it("retire les annulées des DEUX listes, sans toucher au payeur ni au mandat : la clé ne bouge pas", () => {
    const live = withoutCancelled(GROUP, new Set(["ORD-a", "ORD-z"]));

    expect(live?.billable.map((order) => order.orderId)).toEqual(["b"]);
    expect(live?.unbillable).toEqual([]);
    expect(invoiceGroupKey(live?.payerId ?? "", live?.mandate?.mandateId ?? null, null)).toBe(
      invoiceGroupKey(GROUP.payerId, GROUP.mandate?.mandateId ?? null, null),
    );
  });

  it("sans annulée, le groupe est rendu tel quel", () => {
    expect(withoutCancelled(GROUP, new Set())).toEqual(GROUP);
  });

  it("plus aucun bon : `null`, rien à émettre ni à signaler", () => {
    expect(withoutCancelled(GROUP, new Set(["ORD-a", "ORD-b", "ORD-z"]))).toBeNull();
  });

  it("ne reste que des non facturables : le groupe survit, pour être signalé", () => {
    const live = withoutCancelled(GROUP, new Set(["ORD-a", "ORD-b"]));

    expect(live?.billable).toEqual([]);
    expect(live?.unbillable.map((order) => order.orderId)).toEqual(["z"]);
  });
});

describe("groupOrderIds — ce que l'émission verrouille", () => {
  it("tous les bons, facturables ET non facturables", () => {
    expect(groupOrderIds(GROUP)).toEqual(["a", "b", "z"]);
  });
});

describe("withoutMovedCommitments — la course E4″ : un engagement corrigé sous le verrou", () => {
  const ARMY = { number: "1300012345", serviceCode: "SERV-1" };
  const army = (id: string): InvoiceableOrder => ({ ...bon(id), budgetCommitment: ARMY });
  const ARMY_GROUP: PayerInvoicePlan = {
    ...GROUP,
    budgetCommitment: ARMY,
    billable: [army("a"), army("b")],
    unbillable: [],
  };

  it("retire le bon dont le numéro a changé depuis la préparation", () => {
    const live = withoutMovedCommitments(
      ARMY_GROUP,
      new Map([
        ["a", ARMY],
        ["b", { number: "1300067890", serviceCode: "SERV-1" }],
      ]),
    );

    expect(live?.billable.map((order) => order.orderId)).toEqual(["a"]);
    expect(live?.budgetCommitment).toEqual(ARMY);
  });

  it("retire aussi le bon dont seul le code service a changé (E4′ : le code est dans la clé)", () => {
    const live = withoutMovedCommitments(
      ARMY_GROUP,
      new Map([
        ["a", { number: ARMY.number, serviceCode: "SERV-2" }],
        ["b", ARMY],
      ]),
    );

    expect(live?.billable.map((order) => order.orderId)).toEqual(["b"]);
  });

  it("un groupe sans engagement garde ses bons sans engagement", () => {
    expect(
      withoutMovedCommitments(
        GROUP,
        new Map([
          ["a", null],
          ["b", null],
          ["z", null],
        ]),
      ),
    ).toEqual(GROUP);
  });

  it("tous les bons ont changé : `null`, rien à émettre sous cette clé", () => {
    expect(
      withoutMovedCommitments(
        ARMY_GROUP,
        new Map([
          ["a", null],
          ["b", null],
        ]),
      ),
    ).toBeNull();
  });
});

import {
  groupOrderIds,
  invoiceGroupKey,
  withoutCancelled,
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
  };
}

const GROUP: PayerInvoicePlan = {
  payerId: "c_port",
  mandate: mandate("c_port"),
  billable: [bon("a"), bon("b")],
  unbillable: [bon("z")],
};

describe("withoutCancelled — retirer, rien d'autre", () => {
  it("retire les annulées des DEUX listes, sans toucher au payeur ni au mandat : la clé ne bouge pas", () => {
    const live = withoutCancelled(GROUP, new Set(["ORD-a", "ORD-z"]));

    expect(live?.billable.map((order) => order.orderId)).toEqual(["b"]);
    expect(live?.unbillable).toEqual([]);
    expect(invoiceGroupKey(live?.payerId ?? "", live?.mandate?.mandateId ?? null)).toBe(
      invoiceGroupKey(GROUP.payerId, GROUP.mandate?.mandateId ?? null),
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

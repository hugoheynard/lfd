import type { HandoverSubject } from "../../../channels/commerce/handover-subject.reader.js";
import {
  candidateRanks,
  focusedRank,
  readyShipments,
  remainderReferenceOf,
  shipmentLines,
  shipmentPrepared,
  shipmentReference,
} from "../handover-shipments.js";

/** Les envois d'une commande au comptoir (plan E7 reliquat, choix 13, lot L4c). */

const ORDER_LINES = [{ sku: "VIE-001", productName: "Croissant", quantity: 10 }];
const REST_LINES = [{ sku: "VIE-001", productName: "Croissant", quantity: 2 }];

function subject(laterShipments: HandoverSubject["laterShipments"] = []): HandoverSubject {
  return {
    orderId: "ord_1",
    orderNumber: "ORD-ABCD-1234",
    placedByUserId: "usr_1",
    customerLabel: "Les Halles",
    placedAt: new Date(0),
    requestedDeliveryDate: null,
    pickupLabel: null,
    status: "placed",
    settled: true,
    fulfillmentMethod: "pickup",
    note: "",
    lines: ORDER_LINES,
    laterShipments,
  };
}

const PACKED_REST = { rank: 2, prepared: true, lines: REST_LINES };
const PLANNED_REST = { rank: 2, prepared: false, lines: REST_LINES };

describe("les envois d'une commande au comptoir", () => {
  it("le rang 1 est toujours prêt — la règle ne regarde pas le colisage de la commande", () => {
    expect(shipmentPrepared(subject(), 1)).toBe(true);
  });

  it("un reste n'est prêt que colisé, et un rang sans bon ne l'est jamais", () => {
    expect(shipmentPrepared(subject([PACKED_REST]), 2)).toBe(true);
    expect(shipmentPrepared(subject([PLANNED_REST]), 2)).toBe(false);
    expect(shipmentPrepared(subject([PACKED_REST]), 3)).toBe(false);
  });

  it("les lignes : celles de la commande au rang 1, celles du bon au-delà", () => {
    expect(shipmentLines(subject([PACKED_REST]), 1)).toEqual(ORDER_LINES);
    expect(shipmentLines(subject([PACKED_REST]), 2)).toEqual(REST_LINES);
    expect(shipmentLines(subject(), 2)).toEqual([]);
  });

  it("les candidats : la commande, puis les restes colisés", () => {
    expect(candidateRanks(subject([PLANNED_REST]))).toEqual([1]);
    expect(candidateRanks(subject([PACKED_REST]))).toEqual([1, 2]);
  });

  it("les prêts écartent ce qui est déjà retiré, et portent leur numéro", () => {
    expect(readyShipments(subject([PACKED_REST]), new Set())).toEqual([
      { rank: 1, reference: "ORD-ABCD-1234", lines: ORDER_LINES },
      { rank: 2, reference: "ORD-ABCD-1234-2", lines: REST_LINES },
    ]);
    expect(readyShipments(subject([PACKED_REST]), new Set([1])).map(({ rank }) => rank)).toEqual([
      2,
    ]);
  });

  it("la vue montre le premier prêt, sinon la commande", () => {
    expect(focusedRank(readyShipments(subject([PACKED_REST]), new Set([1])))).toBe(2);
    expect(focusedRank([])).toBe(1);
  });

  it("la référence gravée : le numéro de commande au rang 1, `-<rang>` au-delà", () => {
    expect(shipmentReference("ORD-ABCD-1234", 1)).toBe("ORD-ABCD-1234");
    expect(shipmentReference("ORD-ABCD-1234", 2)).toBe("ORD-ABCD-1234-2");
  });
});

describe("le numéro saisi d'un reste", () => {
  it("`ORD-…-2` nomme la commande `ORD-…`, rang 2", () => {
    expect(remainderReferenceOf("ORD-ABCD-1234-2")).toEqual({
      orderNumber: "ORD-ABCD-1234",
      rank: 2,
    });
  });

  it("un suffixe `-1`, `-0` ou absent ne nomme pas un reste", () => {
    expect(remainderReferenceOf("ORD-ABCD-1234-1")).toBeNull();
    expect(remainderReferenceOf("ORD-ABCD-1234-0")).toBeNull();
    expect(remainderReferenceOf("ORDABCD")).toBeNull();
    expect(remainderReferenceOf("-2")).toBeNull();
  });
});

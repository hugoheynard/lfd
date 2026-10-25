import type { BoardContainer, BoardOrder } from "../../ports/packing-board.reader.js";
import { bagLabelsOf } from "../bag-labels.js";

// Un instant recopié, jamais comparé à l'horloge.
const AT = new Date(1_000);

const HEAD = { fulfillmentLabel: "Retrait Village · pro", when: "8 h 00 – 10 h 00" };
const FACTS = { color: "#aa3300", handoverUrl: "https://admin.test/retrait/tok" };

function bag(id: string, label: string): BoardContainer {
  return { id, nature: "bag", label, bin: null, lines: [] };
}

function bin(id: string): BoardContainer {
  return {
    id,
    nature: "bin",
    label: "A3K",
    bin: { binId: `bin_${id}`, code: "A3K", half: null },
    lines: [],
  };
}

function order(containerList: readonly BoardContainer[]): BoardOrder {
  return {
    orderId: "ord_1",
    reference: "ORD-0042",
    customerLabel: "Le Bistrot",
    fulfillmentMethod: "pickup",
    clientele: "pro",
    siteId: "site_village",
    dueAt: "08:00",
    drawnAt: AT,
    packed: null,
    containers: containerList.length,
    containerMode: "listed",
    lines: [],
    containerList,
    shortfallReportedAt: null,
  };
}

describe("bagLabelsOf", () => {
  it("pose le numéro, le client, le libellé du fournil, la couleur et le QR du commerce", () => {
    expect(bagLabelsOf(order([bag("c1", "Sac 1")]), HEAD, FACTS)).toEqual({
      orderId: "ord_1",
      reference: "ORD-0042",
      customerLabel: "Le Bistrot",
      fulfillmentLabel: "Retrait Village · pro",
      when: "8 h 00 – 10 h 00",
      color: "#aa3300",
      handoverUrl: "https://admin.test/retrait/tok",
      bags: [{ containerId: "c1", label: "Sac 1", rank: 1, of: 1 }],
    });
  });

  it("compte « n/N » sur les sacs vivants seulement, les bacs à part", () => {
    // Le poste sert les contenants vivants : « Sac 1 » annulé n'y est plus.
    const view = bagLabelsOf(
      order([bag("c2", "Sac 2"), bin("b1"), bag("c3", "Sac 3")]),
      HEAD,
      FACTS,
    );
    expect(view.bags).toEqual([
      { containerId: "c2", label: "Sac 2", rank: 1, of: 2 },
      { containerId: "c3", label: "Sac 3", rank: 2, of: 2 },
    ]);
  });

  it("une commande que le commerce ne connaît pas : ni carré ni QR, rien de deviné", () => {
    const view = bagLabelsOf(order([bag("c1", "Sac 1")]), HEAD, null);
    expect(view.color).toBeNull();
    expect(view.handoverUrl).toBe("");
  });

  it("une commande sans sac : aucune étiquette", () => {
    expect(bagLabelsOf(order([bin("b1")]), HEAD, FACTS).bags).toEqual([]);
  });
});

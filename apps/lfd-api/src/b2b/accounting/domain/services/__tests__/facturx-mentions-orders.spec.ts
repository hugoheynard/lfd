import { ordersText } from "../facturx-mentions.js";

/**
 * La ligne de référence de la facture (plan E6 § 11, lot E6c2) : les
 * commandes, leur réception, puis les bons de livraison facturés. Les jours ne
 * sont comparés à aucune horloge.
 */
describe("ordersText — commandes et bons de livraison", () => {
  it("cite les commandes puis leurs bons de livraison, dans l'ordre de la pièce", () => {
    expect(
      ordersText([
        {
          orderId: "o1",
          reference: "ORD-1042",
          receivedOn: "2026-10-12",
          deliveryNoteNumbers: ["BL-1042-1"],
        },
        {
          orderId: "o2",
          reference: "ORD-1043",
          receivedOn: "2026-10-13",
          deliveryNoteNumbers: ["BL-1043-1"],
        },
      ]),
    ).toBe(
      "Commandes : ORD-1042 (reçue le 12/10/2026), ORD-1043 (reçue le 13/10/2026) — " +
        "Bons de livraison : BL-1042-1, BL-1043-1.",
    );
  });

  it("une pièce d'avant E6c2, sans ses bons de livraison, ne cite que les commandes", () => {
    expect(ordersText([{ orderId: "o1", reference: "ORD-1", receivedOn: null }])).toBe(
      "Commandes : ORD-1 (réception non constatée).",
    );
  });
});

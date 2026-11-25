import { shipmentPrepared, shipmentReference } from "../handover-shipments.js";

describe("l'envoi d'une commande au comptoir", () => {
  it("le rang 1 est toujours prêt — la règle ne regarde pas le colisage de la commande", () => {
    expect(shipmentPrepared(1)).toBe(true);
  });

  it("un rang > 1 n'a plus rien à tendre", () => {
    expect(shipmentPrepared(2)).toBe(false);
  });

  it("la référence gravée : le numéro de commande au rang 1, `-<rang>` au-delà", () => {
    expect(shipmentReference("ORD-ABCD-1234", 1)).toBe("ORD-ABCD-1234");
    expect(shipmentReference("ORD-ABCD-1234", 2)).toBe("ORD-ABCD-1234-2");
  });
});

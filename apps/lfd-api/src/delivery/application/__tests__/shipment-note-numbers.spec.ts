import { ShipmentNoteNumbers } from "../shipment-note-numbers.js";
import { FixedNoteNumbers } from "./delivery-note-numbers-doubles.js";

describe("ShipmentNoteNumbers — le BL de chaque envoi, lu au tirage", () => {
  it("rend le BL de l'envoi à son rang : un reliquat imprime SON bon", async () => {
    const reader = new FixedNoteNumbers([
      { orderId: "o1", rank: 1, number: "BL-1042-1" },
      { orderId: "o1", rank: 2, number: "BL-1042-2" },
    ]);
    const numbers = await ShipmentNoteNumbers.read(reader, [
      { orderId: "o1", rank: 1 },
      { orderId: "o1", rank: 2 },
    ]);
    expect(numbers.numberOf("o1", 1)).toBe("BL-1042-1");
    expect(numbers.numberOf("o1", 2)).toBe("BL-1042-2");
  });

  it("ne devine rien : un envoi sans BL (hors plan) n'a pas de numéro", async () => {
    const reader = new FixedNoteNumbers([{ orderId: "o1", rank: 1, number: "BL-1042-1" }]);
    const numbers = await ShipmentNoteNumbers.read(reader, [
      { orderId: "o1", rank: 1 },
      { orderId: "o2", rank: 1 },
    ]);
    expect(numbers.numberOf("o2", 1)).toBeNull();
    // Le rang 2 n'existe pas : jamais le BL-1 à sa place.
    expect(numbers.numberOf("o1", 2)).toBeNull();
  });

  it("ne lit pas le commerce quand aucun envoi n'est demandé", async () => {
    const reader = new FixedNoteNumbers();
    const numbers = await ShipmentNoteNumbers.read(reader, []);
    expect(reader.asked).toEqual([]);
    expect(numbers.numberOf("o1", 1)).toBeNull();
  });
});

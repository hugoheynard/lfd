import { AUDIENCE_MIN_CLIENTS, hasEnoughClients } from "../audience-anonymity.js";

describe("le seuil d'anonymat", () => {
  it("vaut cinq clients distincts, le seuil des suggestions collectives", () => {
    expect(AUDIENCE_MIN_CLIENTS).toBe(5);
  });

  it("montre une case à cinq clients, la masque à quatre", () => {
    expect(hasEnoughClients(5)).toBe(true);
    expect(hasEnoughClients(4)).toBe(false);
    expect(hasEnoughClients(0)).toBe(false);
  });
});

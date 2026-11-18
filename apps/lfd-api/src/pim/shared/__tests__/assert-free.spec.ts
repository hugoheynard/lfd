import { assertFree } from "../assert-free.js";

class TakenError extends Error {}

describe("assertFree", () => {
  it("laisse passer une valeur que personne ne porte", () => {
    expect(() => assertFree(null, () => new TakenError("pris"))).not.toThrow();
  });

  it("refuse avec l'erreur de l'appelant, construite sur le porteur trouvé", () => {
    const holder = { id: "a", name: "Dupont" };
    expect(() => assertFree(holder, (found) => new TakenError(`pris par ${found.name}`))).toThrow(
      new TakenError("pris par Dupont"),
    );
  });

  it("laisse passer quand le porteur est l'objet qu'on modifie", () => {
    const holder = { id: "a" };
    expect(() =>
      assertFree(
        holder,
        () => new TakenError("pris"),
        (found) => found.id === "a",
      ),
    ).not.toThrow();
  });

  it("refuse quand le porteur est un autre objet que celui qu'on modifie", () => {
    const holder = { id: "b" };
    expect(() =>
      assertFree(
        holder,
        () => new TakenError("pris"),
        (found) => found.id === "a",
      ),
    ).toThrow(TakenError);
  });
});

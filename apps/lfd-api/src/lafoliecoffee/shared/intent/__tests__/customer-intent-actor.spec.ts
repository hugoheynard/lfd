import { customerIntentActor } from "../customer-intent-actor.js";

describe("customerIntentActor", () => {
  it("préfixe l'identifiant du client par sa nature", () => {
    expect(customerIntentActor("01J8ZK")).toBe("customer:01J8ZK");
  });

  it("ne confond pas un client et une fiche du staff de même identifiant", () => {
    expect(customerIntentActor("01J8ZK")).not.toBe("01J8ZK");
  });
});

import { maskRecipient } from "../recipient-mask.js";

describe("maskRecipient — l'adresse masquée du suivi", () => {
  it("garde la première lettre et le domaine", () => {
    expect(maskRecipient("colette@halles.fr")).toBe("c•••@halles.fr");
  });

  it("ne dit rien de la longueur de la partie locale", () => {
    expect(maskRecipient("c@halles.fr")).toBe("c•••@halles.fr");
    expect(maskRecipient("colette.martin.longue@halles.fr")).toBe("c•••@halles.fr");
  });

  it("garde le domaine après le DERNIER @", () => {
    expect(maskRecipient('"a@b"@halles.fr')).toBe('"•••@halles.fr');
  });

  it("ignore les espaces autour", () => {
    expect(maskRecipient("  colette@halles.fr ")).toBe("c•••@halles.fr");
  });

  it("masque entière une valeur sans @, ou sans partie locale, ou sans domaine", () => {
    expect(maskRecipient("colette")).toBe("•••");
    expect(maskRecipient("@halles.fr")).toBe("•••");
    expect(maskRecipient("colette@")).toBe("•••");
    expect(maskRecipient("")).toBe("•••");
  });
});

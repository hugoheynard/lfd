import { b2bMailTemplates } from "../mail-templates.js";
import { ORDER_REVISED_CASES } from "./rendering-golden/order-revised-cases.js";

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});
const CASES = ORDER_REVISED_CASES["customer.order-revised"];

function textOf(name: string): string {
  const data = CASES[name];
  if (data === undefined) {
    throw new TypeError(`cas inconnu : ${name}`);
  }
  // `Intl` sépare le montant de « € » par une espace insécable : ramenée à l'espace.
  return (REGISTRY["customer.order-revised"](data).text ?? "").replace(/[\u00a0\u202f]/gu, " ");
}

/**
 * « Votre commande est modifiée » : le total s'écrit selon la clientèle et
 * le règlement (Hugo, 2026-11-10), l'écart d'argent reste en TTC.
 */
describe("customer.order-revised — les totaux", () => {
  it("un pro au compte lit le HT seul, comme sa confirmation", () => {
    const text = textOf("account");

    expect(text).toContain("Le total passe de 36,02 € HT à 40,28 € HT.");
    expect(text).not.toContain("TTC (");
  });

  it("un pro par carte lit le TTC d'abord, puis le HT ; l'écart payé en TTC", () => {
    const text = textOf("cardCharged");

    expect(text).toContain(
      "Le total passe de 38,00 € TTC (36,02 € HT) à 42,50 € TTC (40,28 € HT).",
    );
    expect(text).toContain("La différence de 4,50 € a été réglée par carte.");
  });

  it("un pro par carte remboursé : l'écart rendu en TTC", () => {
    expect(textOf("cardRefunded")).toContain("4,50 € vous seront remboursés sur votre carte.");
  });

  it("un particulier lit le TTC seul, sans mention", () => {
    const text = textOf("publicCardCharged");

    expect(text).toContain("Le total passe de 38,00 € à 42,50 €.");
    expect(text).not.toContain("HT");
  });

  it("un fait sans HT se dit en TTC seul, même à un pro", () => {
    expect(textOf("proWithoutPretax")).toContain("Le total passe de 38,00 € à 42,50 €.");
  });

  it("un total égal d'un pro par carte garde les deux montants", () => {
    expect(textOf("unchangedBare")).toContain("Le total reste de 38,00 € TTC (36,02 € HT).");
  });
});

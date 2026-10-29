import { SaleSkuAliases } from "../../../catalog/domain/sale-sku-aliases.js";
import { P_X_ALIASED } from "../../../catalog/domain/__tests__/sale-sku-alias.doubles.js";
import { everOrderedAmong, historyByAskedSku } from "../article-history.js";

/** L'historique d'un compte se lit par ARTICLE (`plan-defaut-sous-sa-reference.md`, § 2 a). */
describe("l'historique d'alerte, par article", () => {
  const aliases = SaleSkuAliases.of(P_X_ALIASED);

  it("additionne P-X et P-X-1 dans un seul historique, rendu sous la référence du panier", () => {
    const recent = [
      { sku: "P-X-1", quantity: 4 },
      { sku: "P-X", quantity: 3 },
      { sku: "P-X-2", quantity: 9 },
    ];
    const history = historyByAskedSku(recent, ["P-X-1", "P-X-2"], aliases, 10);
    expect(history.get("P-X-1")).toEqual([4, 3]);
    expect(history.get("P-X-2")).toEqual([9]);
  });

  it("borne l'historique d'un article sur toutes ses graphies", () => {
    const recent = [
      { sku: "P-X-1", quantity: 4 },
      { sku: "P-X", quantity: 3 },
    ];
    expect(historyByAskedSku(recent, ["P-X-1"], aliases, 1).get("P-X-1")).toEqual([4]);
  });

  it("un article commandé sous son ancienne référence n'est pas « jamais commandé »", () => {
    expect(everOrderedAmong([{ sku: "P-X" }], ["P-X-1", "P-Y"], aliases)).toEqual(
      new Set(["P-X-1"]),
    );
  });

  it("table vide : rien ne se fusionne", () => {
    const none = SaleSkuAliases.none();
    expect(everOrderedAmong([{ sku: "P-X" }], ["P-X-1"], none)).toEqual(new Set());
  });
});

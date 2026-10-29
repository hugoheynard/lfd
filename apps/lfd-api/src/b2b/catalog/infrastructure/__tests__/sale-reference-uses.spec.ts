import { SaleSkuAliases } from "../../domain/sale-sku-aliases.js";
import { usesBySpelling } from "../sale-reference-uses.js";

/** D-c de `plan-defaut-sous-sa-reference.md` : l'usage se compte sur toutes les graphies. */
describe("usesBySpelling — l'unité de vente « déjà utilisée », par alias", () => {
  const aliases = SaleSkuAliases.of([{ aliasSku: "PAI-001", targetSku: "PAI-001-1" }]);

  it("PAI-001-1 est utilisée dès qu'une ligne PAI-001 existe", () => {
    const uses = usesBySpelling(
      [{ sku: "PAI-001-1", shopSku: "PAI-001-1" }],
      [
        ["order", new Set(["PAI-001"])],
        ["shop_cart", new Set()],
      ],
      aliases,
    );
    expect(uses.get("PAI-001-1")).toEqual(["order"]);
  });

  it("une autre déclinaison de la fiche n'hérite pas des usages de l'alias", () => {
    const uses = usesBySpelling(
      [{ sku: "PAI-001-2", shopSku: "PAI-001-2" }],
      [["order", new Set(["PAI-001"])]],
      aliases,
    );
    expect(uses.get("PAI-001-2")).toEqual([]);
  });

  it("table vide : seule la référence de vente compte, comme avant", () => {
    const uses = usesBySpelling(
      [{ sku: "PAI-001-1", shopSku: "PAI-001" }],
      [
        ["order", new Set(["PAI-001"])],
        ["bundle", new Set(["PAI-001-1"])],
      ],
      SaleSkuAliases.none(),
    );
    expect(uses.get("PAI-001-1")).toEqual(["order"]);
  });
});

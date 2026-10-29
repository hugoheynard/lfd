import { ReviseOrderCommand } from "../revise-order.command.js";
import { content, placedOrder, reviseScene } from "./revision-scene.js";

/**
 * **Une commande ouverte, passée sous une ancienne référence, se normalise à
 * sa modification** (`documentation/catalogue/plan-defaut-sous-sa-reference.md`,
 * § 6, L3). Dans la scène, `VIE-001` est la référence que la boutique vend et
 * `VIE-OLD` l'ancienne, que `sale_sku_alias` lui fait désigner.
 */

const STAFF = { kind: "staff", staffId: "stf_1" } as const;
const ALIASES = [{ aliasSku: "VIE-OLD", targetSku: "VIE-001" }] as const;

describe("ReviseOrderHandler — la normalisation d'une ancienne référence (L3)", () => {
  it("écrit la ligne sous la cible, à son prix figé, et le trace comme un changement de lignes", async () => {
    const placed = await placedOrder();
    // Passée avant la bascule, sous l'ancienne référence, à 1,80 € HT.
    const order = {
      ...placed,
      lines: placed.lines.map((line) => ({
        ...line,
        sku: "VIE-OLD",
        unitPriceMillicents: 180_000,
        pricing: null,
      })),
    };
    const { handler, revisions } = reviseScene(order, { aliases: ALIASES });

    await handler.execute(
      new ReviseOrderCommand(
        "ord_1",
        STAFF,
        0,
        content({ lines: [{ sku: "VIE-OLD", quantity: 12 }] }),
      ),
    );

    const saved = revisions.saved[0]?.revision;
    expect(
      saved?.state.lines.map((line) => [line.sku, line.quantity, line.unitPriceMillicents]),
    ).toEqual([["VIE-001", 12, 180_000]]);
    expect(saved?.changes).toContain("lines");
  });

  it("fusionne les deux graphies d'un même article : quantités additionnées, la ligne de la cible l'emporte", async () => {
    const placed = await placedOrder();
    const [croissant] = placed.lines;
    if (croissant === undefined) {
      throw new Error("La scène compose une ligne de croissants.");
    }
    const order = {
      ...placed,
      lines: [
        { ...croissant, sku: "VIE-OLD", quantity: 4, unitPriceMillicents: 180_000, pricing: null },
        { ...croissant, quantity: 6 },
      ],
    };
    const { handler, revisions } = reviseScene(order, { aliases: ALIASES });

    await handler.execute(
      new ReviseOrderCommand(
        "ord_1",
        STAFF,
        0,
        content({
          lines: [
            { sku: "VIE-OLD", quantity: 4 },
            { sku: "VIE-001", quantity: 6 },
          ],
        }),
      ),
    );

    const lines = revisions.saved[0]?.revision.state.lines ?? [];
    expect(lines.map((line) => [line.sku, line.quantity, line.unitPriceMillicents])).toEqual([
      ["VIE-001", 10, croissant.unitPriceMillicents],
    ]);
  });
});

import { QuantityBelowMinimumError } from "../../../domain/errors/sale-quantity-errors.js";
import type { UnsealedCatalogItem } from "../../../../catalog/domain/ports/product-catalog.reader.js";
import { ReviseOrderCommand } from "../revise-order.command.js";
import { CATALOG, content, placedOrder, reviseScene } from "./revision-scene.js";

/**
 * **Le minimum d'une ligne GARDÉE qu'on change** — dérogation à R3 décidée par
 * Hugo le 2026-10-29 (`documentation/catalogue/plan-quantite-minimale.md`, M4).
 *
 * La commande de la scène porte 10 croissants, passée sans minimum ; le
 * catalogue en publie un ensuite (6 pour un pro). Seule une ligne gardée dont
 * la quantité CHANGE y est tenue.
 */

const STAFF = { kind: "staff", staffId: "stf_1" } as const;
const PRO_MINIMUM = 6;

function withMinimum(proMinimum: number): readonly UnsealedCatalogItem[] {
  return CATALOG.map((item) =>
    item.sku === "VIE-001"
      ? {
          ...item,
          saleUnit: "piece",
          weightMinGrams: null,
          weightStepGrams: null,
          minQuantities: { pro: proMinimum, public: null },
        }
      : item,
  );
}

/** Le croissant sorti du catalogue depuis la commande : seul le pain y reste. */
const WITHOUT_CROISSANT = CATALOG.filter((item) => item.sku !== "VIE-001");

function revise(lines: readonly { sku: string; quantity: number }[]) {
  return new ReviseOrderCommand("ord_1", STAFF, 0, content({ lines: [...lines] }));
}

describe("ReviseOrderHandler — le minimum d'une ligne gardée", () => {
  it("refuse une ligne gardée baissée sous le minimum, sans rien écrire", async () => {
    const { handler, revisions } = reviseScene(await placedOrder(), {
      catalogItems: withMinimum(PRO_MINIMUM),
    });

    await expect(
      handler.execute(revise([{ sku: "VIE-001", quantity: PRO_MINIMUM - 1 }])),
    ).rejects.toBeInstanceOf(QuantityBelowMinimumError);
    expect(revisions.saved).toEqual([]);
  });

  it("laisse passer une ligne gardée baissée jusqu'au minimum", async () => {
    const { handler, revisions } = reviseScene(await placedOrder(), {
      catalogItems: withMinimum(PRO_MINIMUM),
    });

    await handler.execute(revise([{ sku: "VIE-001", quantity: PRO_MINIMUM }]));

    expect(revisions.saved).toHaveLength(1);
  });

  it("ne relit pas le minimum d'une ligne gardée inchangée : les autres lignes restent révisables", async () => {
    // Un minimum posé APRÈS la commande, au-dessus de ses 10 croissants.
    const { handler, revisions } = reviseScene(await placedOrder(), {
      catalogItems: withMinimum(12),
    });

    await handler.execute(
      revise([
        { sku: "VIE-001", quantity: 10 },
        { sku: "PAI-001", quantity: 2 },
      ]),
    );

    expect(revisions.saved).toHaveLength(1);
  });

  /**
   * Changement de règle (plan des remises acquises, § 10.1, 2026-10-31) : la
   * décision du 2026-10-29 laissait passer cette quantité, faute de minimum
   * connu. Un article sorti du catalogue ne se retarife plus : changer sa
   * quantité est refusé par son nom ; le garder tel quel, ou le retirer, passe.
   */
  it("refuse de changer la quantité d'une ligne gardée dont l'article est sorti du catalogue", async () => {
    const { handler, revisions } = reviseScene(await placedOrder(), {
      catalogItems: WITHOUT_CROISSANT,
    });

    await expect(handler.execute(revise([{ sku: "VIE-001", quantity: 1 }]))).rejects.toThrow(
      "« Croissant » n'est plus vendu : gardez la quantité commandée ou retirez-le.",
    );
    expect(revisions.saved).toEqual([]);
  });

  it("une ligne gardée dont l'article est sorti du catalogue se retire, ou se garde telle quelle", async () => {
    const removed = reviseScene(await placedOrder(), { catalogItems: WITHOUT_CROISSANT });
    await removed.handler.execute(revise([{ sku: "PAI-001", quantity: 1 }]));
    expect(removed.revisions.saved).toHaveLength(1);

    const kept = reviseScene(await placedOrder(), { catalogItems: WITHOUT_CROISSANT });
    await kept.handler.execute(
      revise([
        { sku: "VIE-001", quantity: 10 },
        { sku: "PAI-001", quantity: 1 },
      ]),
    );
    expect(kept.revisions.saved).toHaveLength(1);
  });
});

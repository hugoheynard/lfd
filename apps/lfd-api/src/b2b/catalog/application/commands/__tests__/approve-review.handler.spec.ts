import { CatalogItemNotFoundError } from "../../../domain/errors/catalog-not-found.error.js";
import { ApproveReviewCommand } from "../approve-review.command.js";
import { ApproveReviewHandler } from "../approve-review.handler.js";
import { build, facts, NAME, SKU } from "./catalog-decision-doubles.js";

/** La validation par audience (lot 3 ; côté pro, Hugo, 2026-10-15) : un fait par article et par audience validée. */
function setup(proReviewPending: boolean, publicReviewPending: boolean) {
  const doubles = build(undefined, { audience: "both", proReviewPending, publicReviewPending });
  return {
    ...doubles,
    approve: new ApproveReviewHandler(doubles.items, doubles.events, doubles.uow),
  };
}

const fact = (type: string) => ({
  type,
  subjectType: "catalog_item",
  subjectId: SKU,
  payload: { subjectLabel: NAME, sku: SKU },
});

describe("ApproveReviewHandler", () => {
  it("lève l'attente des deux audiences, puis journalise chacune", async () => {
    const { approve, events, steps, items } = setup(true, true);

    await approve.execute(new ApproveReviewCommand([SKU, SKU], ["pro", "public", "pro"]));

    expect(items.current(SKU)?.isReviewPendingFor("pro")).toBe(false);
    expect(items.current(SKU)?.isReviewPendingFor("public")).toBe(false);
    expect(steps[0]).toBe(`save:${SKU}`);
    expect(facts(events)).toEqual([
      fact("catalog_item.pro_review_approved"),
      fact("catalog_item.public_review_approved"),
    ]);
  });

  it("ne valide que l'audience demandée", async () => {
    const { approve, events, items } = setup(true, true);

    await approve.execute(new ApproveReviewCommand([SKU], ["pro"]));

    expect(items.current(SKU)?.isReviewPendingFor("public")).toBe(true);
    expect(events.factTypes()).toEqual(["catalog_item.pro_review_approved"]);
  });

  it("valider ce qui n'attendait rien n'écrit ni article ni fait", async () => {
    const { approve, events, steps } = setup(false, false);

    await approve.execute(new ApproveReviewCommand([SKU], ["pro", "public"]));

    expect(steps).toEqual([]);
    expect(events.traced).toHaveLength(0);
  });

  it("refuse tout le lot si un SKU n'est plus en vente, sans rien valider", async () => {
    const { approve, events, items } = setup(true, true);

    await expect(
      approve.execute(new ApproveReviewCommand([SKU, "INCONNU-1"], ["public"])),
    ).rejects.toBeInstanceOf(CatalogItemNotFoundError);
    expect(items.current(SKU)?.isReviewPendingFor("public")).toBe(true);
    expect(events.traced).toHaveLength(0);
  });
});

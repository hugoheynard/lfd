import type { CatalogItem } from "../../../domain/entities/catalog-item.js";
import { MaskingOutsideAudienceError } from "../../../domain/errors/catalog-errors.js";
import { SetMaskingCommand } from "../set-masking.command.js";
import { SetMaskingHandler } from "../set-masking.handler.js";
import { build, facts, SKU, NAME } from "./catalog-decision-doubles.js";
import type { Placement } from "../../../domain/entities/catalog-item.js";

/** Le handler sous test, branché sur les doubles de `build`. */
function setup(seed?: (item: CatalogItem) => void, placement?: Placement) {
  const doubles = build(seed, placement);
  return {
    ...doubles,
    masking: new SetMaskingHandler(doubles.items, doubles.events, doubles.uow),
  };
}

describe("SetMaskingHandler — la route unique du masquage", () => {
  it("masquer pour les pros : le fait part après l'article", async () => {
    const { masking, events, steps } = setup();

    await masking.execute(new SetMaskingCommand(SKU, "pro", true, "fiche-1"));

    expect(steps).toEqual([`save:${SKU}`, "journal:catalog_item.hidden"]);
    expect(facts(events)).toEqual([
      {
        type: "catalog_item.hidden",
        subjectType: "catalog_item",
        subjectId: SKU,
        payload: { subjectLabel: NAME, sku: SKU },
      },
    ]);
  });

  it("masquer pour le public journalise « hidden_public », sans toucher aux pros", async () => {
    const { masking, events, items } = setup();

    await masking.execute(new SetMaskingCommand(SKU, "public", true, "fiche-1"));

    expect(events.factTypes()).toEqual(["catalog_item.hidden_public"]);
    expect(items.current(SKU)?.isMaskedFor("pro")).toBe(false);
  });

  it("remettre en vente chez les pros journalise « shown »", async () => {
    const { masking, events } = setup((item) => item.hide("fiche-0"));

    await masking.execute(new SetMaskingCommand(SKU, "pro", false, "fiche-1"));

    expect(events.factTypes()).toEqual(["catalog_item.shown"]);
  });

  it("remettre en boutique publique journalise « shown_public »", async () => {
    const { masking, events } = setup((item) => item.hidePublic("fiche-0"));

    await masking.execute(new SetMaskingCommand(SKU, "public", false, "fiche-1"));

    expect(events.factTypes()).toEqual(["catalog_item.shown_public"]);
  });

  it("un geste sans effet n'écrit aucun fait", async () => {
    const { masking, events } = setup((item) => item.hide("fiche-0"));

    await masking.execute(new SetMaskingCommand(SKU, "pro", true, "fiche-1"));
    await masking.execute(new SetMaskingCommand(SKU, "public", false, "fiche-1"));

    expect(events.traced).toHaveLength(0);
  });

  it("refuse de masquer pour une audience que l'article n'a pas, sans rien écrire", async () => {
    const { masking, events, steps } = setup(undefined, {
      audience: "pro",
      publicReviewPending: false,
      proReviewPending: false,
    });

    await expect(
      masking.execute(new SetMaskingCommand(SKU, "public", true, "fiche-1")),
    ).rejects.toBeInstanceOf(MaskingOutsideAudienceError);
    expect(steps).toEqual([]);
    expect(events.traced).toHaveLength(0);
  });
});

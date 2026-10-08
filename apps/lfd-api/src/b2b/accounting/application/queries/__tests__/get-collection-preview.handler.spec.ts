import type { CollectionPreviewOpenView } from "@lfd/contracts";

import { CollectionFloorMissingError } from "../../../domain/errors/collection-errors.js";
import {
  ENTITY_ID,
  STAFF_AUTHOR,
  mandate,
  order,
} from "../../../domain/services/__tests__/collection-fixtures.js";
import { ConstituteCollectionBatchesCommand } from "../../commands/constitute-collection-batches.command.js";
import { world } from "../../commands/__tests__/collection-world.js";
import { GetCollectionPreviewQuery } from "../collection-batch-queries.js";
import { GetCollectionPreviewHandler } from "../get-collection-preview.handler.js";

/**
 * L'aperçu du mois (plan `plan-prelevement-automatique.md`, PA4). L'horloge est
 * celle du monde du lot (2 octobre 2026) : le mois qui court se clôt le
 * 1er novembre. Les dates ne sont comparées qu'au cycle, jamais au mur.
 */
function previewWorld() {
  const w = world();
  const preview = new GetCollectionPreviewHandler(w.candidates, w.mandates, w.clock);
  return { ...w, preview };
}

async function openPreview(w: ReturnType<typeof previewWorld>): Promise<CollectionPreviewOpenView> {
  const view = await w.preview.execute(new GetCollectionPreviewQuery(ENTITY_ID));
  if (view.state !== "open") {
    throw new Error(`aperçu attendu ouvert, reçu ${view.state}`);
  }
  return view;
}

describe("l'aperçu du mois", () => {
  it("annonce les montants que le lot prélèverait — la facture de la ligne, pas Σ bons", async () => {
    const w = previewWorld();
    w.candidates.orders = [order("c_port"), order("c_port"), order("c_fournil")];
    w.mandates.mandates = [mandate("c_port"), mandate("c_fournil")];

    const view = await openPreview(w);
    const [id] = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, STAFF_AUTHOR),
    );

    const batch = w.batches.saved.get(id ?? "");
    expect(view.lines.map((line) => line.amountCents)).toEqual(
      batch?.lines.map((line) => line.amountCents),
    );
    expect(view.totalCents).toBe(batch?.totalCents);
    expect(view.lines.map((line) => line.orderCount).sort()).toEqual([1, 2]);
    expect(view.ordersTotalCents).toBe(3_000);
  });

  it("n'écrit rien et ne verrouille rien", async () => {
    const w = previewWorld();
    w.candidates.orders = [order("c_port"), order("c_sans_mandat")];
    w.mandates.mandates = [mandate("c_port")];

    await openPreview(w);

    expect(w.steps.log.some((step) => step.startsWith("lock:"))).toBe(false);
    expect(w.batches.saved.size).toBe(0);
    expect(w.orders.saved.size).toBe(0);
    expect(w.events.factTypes()).toEqual([]);
  });

  it("porte le mois qui court, et nomme les écartés et les sans-mandat", async () => {
    const w = previewWorld();
    w.candidates.orders = [order("c_sans_mandat")];

    const view = await openPreview(w);

    expect(view.cycleClosesAt).toBe("2026-10-31T23:00:00.000Z");
    expect(view.lines).toEqual([]);
    expect(view.unmandatedCompanies).toEqual(["Société c_sans_mandat"]);
    expect(view.exclusions).toEqual([
      expect.objectContaining({ companyName: "Société c_sans_mandat", reason: "no_mandate" }),
    ]);
  });

  it("mise en service après la prochaine clôture : « pas encore prélevable », deux dates", async () => {
    const w = previewWorld();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    // 5 novembre, Paris — après la clôture du 1er novembre.
    w.candidates.floorAt = new Date("2026-11-05T08:00:00.000Z");

    const view = await w.preview.execute(new GetCollectionPreviewQuery(ENTITY_ID));

    expect(view).toEqual({
      state: "not_yet_open",
      floorAt: "2026-11-05T08:00:00.000Z",
      firstClosureAt: "2026-11-30T23:00:00.000Z",
    });
  });

  it("sans plancher, refuse comme la constitution", async () => {
    const w = previewWorld();
    w.candidates.floorAt = null;

    await expect(w.preview.execute(new GetCollectionPreviewQuery(ENTITY_ID))).rejects.toThrow(
      CollectionFloorMissingError,
    );
  });
});

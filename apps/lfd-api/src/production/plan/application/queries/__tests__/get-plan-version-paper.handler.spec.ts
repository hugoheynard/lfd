import { productionCountPdfKey } from "../../../../shared/print/index.js";
import {
  PlanVersionPaperNotArchivedError,
  PlanVersionPaperUnknownVersionError,
} from "../../../domain/errors/dossier-resend-errors.js";
import { dayDossierPdfKey } from "../../../domain/services/day-dossier-pdf.js";
import { GetPlanVersionPaperHandler } from "../get-plan-version-paper.handler.js";
import { GetPlanVersionPaperQuery } from "../get-plan-version-paper.query.js";
import { EntriesListing, PaperBucket, entry } from "./plan-version-doubles.js";

const DAY = "2026-11-28";
const CLOSED = entry().closedAt;

/** Le papier rangé d'une version passée : servi, ou 404 — jamais refait (lot H6). */
describe("GetPlanVersionPaperHandler", () => {
  const entries = [
    entry({ version: 1 }),
    entry({ version: 2, cause: "order_withdrawn", paperVersion: 1 }),
    entry({ version: 3, cause: "retaken" }),
  ];

  it("sert le dossier rangé de la version, sous un nom qui la dit", async () => {
    const bucket = new PaperBucket().put(dayDossierPdfKey(DAY, CLOSED, null, 1));

    const paper = await new GetPlanVersionPaperHandler(new EntriesListing(entries), bucket).execute(
      new GetPlanVersionPaperQuery(DAY, 1, "dossier"),
    );

    expect(paper.fileName).toBe(`dossier-du-jour-${DAY}-version-1.pdf`);
    expect(paper.bytes.toString()).toBe("%PDF");
  });

  it("sert le compte à produire rangé de la version", async () => {
    const bucket = new PaperBucket().put(productionCountPdfKey(DAY, CLOSED, null, 3));

    const paper = await new GetPlanVersionPaperHandler(new EntriesListing(entries), bucket).execute(
      new GetPlanVersionPaperQuery(DAY, 3, "count"),
    );

    expect(paper.fileName).toBe(`compte-a-produire-${DAY}-version-3.pdf`);
  });

  it("une version sans papier propre (un retrait) sert celui de la version d'avant", async () => {
    const bucket = new PaperBucket().put(dayDossierPdfKey(DAY, CLOSED, null, 1));

    const paper = await new GetPlanVersionPaperHandler(new EntriesListing(entries), bucket).execute(
      new GetPlanVersionPaperQuery(DAY, 2, "dossier"),
    );

    expect(paper.fileName).toBe(`dossier-du-jour-${DAY}-version-1.pdf`);
  });

  it("un papier non rangé : 404, et rien n'est écrit", async () => {
    const bucket = new PaperBucket();

    await expect(
      new GetPlanVersionPaperHandler(new EntriesListing(entries), bucket).execute(
        new GetPlanVersionPaperQuery(DAY, 3, "dossier"),
      ),
    ).rejects.toThrow(PlanVersionPaperNotArchivedError);
    expect(bucket.objects.size).toBe(0);
  });

  it("une version que la journée n'a pas : 404 nommé", async () => {
    await expect(
      new GetPlanVersionPaperHandler(new EntriesListing(entries), new PaperBucket()).execute(
        new GetPlanVersionPaperQuery(DAY, 9, "dossier"),
      ),
    ).rejects.toThrow(PlanVersionPaperUnknownVersionError);
  });
});

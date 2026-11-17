import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  FixedStaffAuthorDirectory,
  authorsKnownAs,
} from "../../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { ProductionDisplaySettings } from "../../../../shared/print/index.js";
import { InMemoryDisplaySettings } from "../../../../shared/print/application/__tests__/production-display-settings-doubles.js";
import { FixedPlacedProducts } from "../../../../workstations/application/__tests__/placement-doubles.js";
import { NoProductPlacedError } from "../../../domain/errors/production-display-errors.js";
import { SetProductionDisplayCommand } from "../set-production-display.command.js";
import { SetProductionDisplayHandler } from "../set-production-display.handler.js";

/** Réglages › Production › Rangement (2026-10-30), ports doublés. */
function subject(posed: ProductionDisplaySettings | null = null, placed = 0) {
  const clock = new FixedClock(new Date());
  const settings = new InMemoryDisplaySettings(posed);
  const events = new RecordingPublisher();
  const authors = new FixedStaffAuthorDirectory(
    authorsKnownAs({ firstName: "Marie", lastName: "Dupont" }, "staff-1"),
  );
  const handler = new SetProductionDisplayHandler(
    settings.reader(),
    settings,
    authors,
    events,
    clock,
    new DirectUnitOfWork(),
    new FixedPlacedProducts(placed),
  );
  return { clock, settings, events, handler };
}

describe("SetProductionDisplayHandler", () => {
  it("affiche les sous-catégories, fige l'auteur et journalise l'avant et l'après", async () => {
    const { handler, settings, events, clock } = subject();

    await handler.execute(new SetProductionDisplayCommand(true, "staff-1"));

    expect(settings.writes).toEqual([
      {
        showSubcategories: true,
        grouping: "shelf",
        at: clock.now(),
        author: { staffUserId: "staff-1", name: "Marie Dupont" },
      },
    ]);
    expect(events.factTypes()).toEqual(["production_display_settings.updated"]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "production_display_settings",
      subjectId: "house",
      payload: {
        showSubcategories: true,
        grouping: "shelf",
        previous: { showSubcategories: false, grouping: "shelf" },
      },
    });
  });

  it("reposer le défaut quand rien n'est posé n'écrit ni ne journalise rien", async () => {
    const { handler, settings, events } = subject();

    await handler.execute(new SetProductionDisplayCommand(false, "staff-1"));

    expect(settings.writes).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("masquer des sous-catégories affichées écrit l'état et journalise", async () => {
    const { handler, settings, events } = subject(
      ProductionDisplaySettings.of({ showSubcategories: true, grouping: "shelf" }),
    );

    await handler.execute(new SetProductionDisplayCommand(false, "staff-1"));

    expect(settings.posed?.showSubcategories).toBe(false);
    expect(events.factTypes()).toEqual(["production_display_settings.updated"]);
  });

  it("le mode boutique explicite, déjà en vigueur, n'écrit rien", async () => {
    const { handler, settings } = subject();

    await handler.execute(new SetProductionDisplayCommand(false, "staff-1", "shelf"));

    expect(settings.writes).toEqual([]);
  });

  it("refuse la bascule en mode prod tant qu'aucun produit n'a de poste", async () => {
    const { handler, settings, events } = subject(null, 0);

    await expect(
      handler.execute(new SetProductionDisplayCommand(false, "staff-1", "workstation")),
    ).rejects.toThrow(NoProductPlacedError);
    expect(settings.writes).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("accepte le mode prod dès qu'un produit a un poste, et journalise l'avant et l'après", async () => {
    const { handler, settings, events } = subject(null, 3);

    await handler.execute(new SetProductionDisplayCommand(false, "staff-1", "workstation"));

    expect(settings.posed?.grouping).toBe("workstation");
    expect(events.traced[0]?.journalFact()).toMatchObject({
      payload: { grouping: "workstation", previous: { grouping: "shelf" } },
    });
  });

  it("revenir en mode boutique depuis le mode prod est toujours admis, et journalisé", async () => {
    const { handler, settings, events } = subject(
      ProductionDisplaySettings.of({ showSubcategories: false, grouping: "workstation" }),
      0,
    );

    await handler.execute(new SetProductionDisplayCommand(false, "staff-1", "shelf"));

    expect(settings.posed?.grouping).toBe("shelf");
    expect(events.traced[0]?.journalFact()).toMatchObject({
      payload: { grouping: "shelf", previous: { grouping: "workstation" } },
    });
  });

  it("sans `grouping`, garde le mode en vigueur — même le mode prod sans postes", async () => {
    const { handler, settings } = subject(
      ProductionDisplaySettings.of({ showSubcategories: false, grouping: "workstation" }),
      0,
    );

    await handler.execute(new SetProductionDisplayCommand(true, "staff-1"));

    expect(settings.posed?.grouping).toBe("workstation");
    expect(settings.posed?.showSubcategories).toBe(true);
  });
});

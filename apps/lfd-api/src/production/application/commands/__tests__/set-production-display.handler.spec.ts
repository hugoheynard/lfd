import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  FixedStaffAuthorDirectory,
  authorsKnownAs,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { ProductionDisplaySettings } from "../../../domain/entities/production-display-settings.js";
import { InMemoryDisplaySettings } from "../../__tests__/production-display-settings-doubles.js";
import { SetProductionDisplayCommand } from "../set-production-display.command.js";
import { SetProductionDisplayHandler } from "../set-production-display.handler.js";

/** Réglages › Production › Rangement (2026-10-30), ports doublés. */
function subject(posed: ProductionDisplaySettings | null = null) {
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
        at: clock.now(),
        author: { staffUserId: "staff-1", name: "Marie Dupont" },
      },
    ]);
    expect(events.factTypes()).toEqual(["production_display_settings.updated"]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "production_display_settings",
      subjectId: "house",
      payload: { showSubcategories: true, previous: { showSubcategories: false } },
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
      ProductionDisplaySettings.of({ showSubcategories: true }),
    );

    await handler.execute(new SetProductionDisplayCommand(false, "staff-1"));

    expect(settings.posed?.showSubcategories).toBe(false);
    expect(events.factTypes()).toEqual(["production_display_settings.updated"]);
  });
});

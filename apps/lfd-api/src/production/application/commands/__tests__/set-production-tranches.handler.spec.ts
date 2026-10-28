import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  FixedStaffAuthorDirectory,
  authorsKnownAs,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { ProductionTrancheSettings } from "../../../domain/entities/production-tranche-settings.js";
import { DuplicateTrancheError } from "../../../domain/errors/production-tranches-errors.js";
import { InMemoryTrancheSettings } from "../../__tests__/production-tranche-settings-doubles.js";
import { SetProductionTranchesCommand } from "../set-production-tranches.command.js";
import { SetProductionTranchesHandler } from "../set-production-tranches.handler.js";

/** Réglages › Production › Tranches (plan des tranches, T1), ports doublés. */
function subject(posed: ProductionTrancheSettings | null = null) {
  const clock = new FixedClock(new Date());
  const settings = new InMemoryTrancheSettings(posed);
  const events = new RecordingPublisher();
  const authors = new FixedStaffAuthorDirectory(
    authorsKnownAs({ firstName: "Marie", lastName: "Dupont" }, "staff-1"),
  );
  const handler = new SetProductionTranchesHandler(
    settings.reader(),
    settings,
    authors,
    events,
    clock,
    new DirectUnitOfWork(),
  );
  return { clock, settings, events, authors, handler };
}

describe("SetProductionTranchesHandler", () => {
  it("pose les heures triées, fige l'auteur et journalise l'avant et l'après", async () => {
    const { handler, settings, events, clock } = subject();

    await handler.execute(new SetProductionTranchesCommand("fixed", ["07:00", "05:00"], "staff-1"));

    expect(settings.writes).toEqual([
      {
        mode: "fixed",
        fixedTranches: ["05:00", "07:00"],
        at: clock.now(),
        author: { staffUserId: "staff-1", name: "Marie Dupont" },
      },
    ]);
    expect(events.factTypes()).toEqual(["production_tranche_settings.updated"]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "production_tranche_settings",
      subjectId: "house",
      payload: {
        mode: "fixed",
        fixedTranches: ["05:00", "07:00"],
        previous: { mode: "fixed", fixedTranches: [] },
      },
    });
  });

  it("une fiche sans nom laisse le nom vide : on n'en invente pas", async () => {
    const { handler, settings } = subject();

    await handler.execute(new SetProductionTranchesCommand("computed", [], "staff-inconnu"));

    expect(settings.writes[0]?.author).toEqual({ staffUserId: "staff-inconnu", name: null });
  });

  it("reposer l'état en vigueur n'écrit ni ne journalise rien", async () => {
    const { handler, settings, events } = subject(
      ProductionTrancheSettings.set("fixed", ["05:00", "07:00"]),
    );

    await handler.execute(new SetProductionTranchesCommand("fixed", ["07:00", "05:00"], "staff-1"));

    expect(settings.writes).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("refuse un doublon avant toute lecture, sans rien écrire", async () => {
    const { handler, settings, events, authors } = subject();

    await expect(
      handler.execute(new SetProductionTranchesCommand("fixed", ["05:00", "05:00"], "staff-1")),
    ).rejects.toThrow(DuplicateTrancheError);
    expect(settings.writes).toEqual([]);
    expect(events.traced).toEqual([]);
    expect(authors.asked).toEqual([]);
  });
});

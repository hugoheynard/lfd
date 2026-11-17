import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { ProductionTrackingSettings } from "../../../domain/entities/production-tracking-settings.js";
import { InvalidTrackingMarginError } from "../../../domain/errors/tracking-errors.js";
import { InMemoryTrackingSettings } from "../../__tests__/tracking-doubles.js";
import { SetProductionTrackingCommand } from "../set-production-tracking.command.js";
import { SetProductionTrackingHandler } from "../set-production-tracking.handler.js";

/**
 * Réglages › Niveau de suivi (`fournil/les-niveaux-de-suivi.md`), ports doublés. L'instant n'est comparé qu'à ce que le geste écrit.
 */
const NOW = new Date("2026-11-17T09:00:00.000Z");
let keys = 0;
const nextKey = (): string => `tracking_${(keys += 1)}`;

function subject(posed: ProductionTrackingSettings | null = null) {
  const settings = new InMemoryTrackingSettings(posed);
  const events = new RecordingPublisher();
  const handler = new SetProductionTrackingHandler(
    settings.reader(),
    settings.repository(),
    new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Marie", lastName: "Dupont" }, "staff-1"),
    ),
    events,
    new FixedClock(NOW),
    new DirectUnitOfWork(),
    inMemoryIntents(),
  );
  return { settings, events, handler };
}

describe("SetProductionTrackingHandler", () => {
  it("pose le niveau et la marge, fige l'auteur et journalise l'avant (défaut compris)", async () => {
    const { handler, settings, events } = subject();

    await handler.execute(new SetProductionTrackingCommand("simple", 20, "staff-1", nextKey()));

    expect(settings.saves).toHaveLength(1);
    expect(settings.saves[0]).toMatchObject({
      settings: { level: "simple", marginMinutes: 20 },
      at: NOW,
      author: { staffUserId: "staff-1", name: "Marie Dupont" },
    });
    expect(events.traced[0]?.journalFact()).toEqual({
      type: "production_tracking_settings.updated",
      subjectType: "production_tracking_settings",
      subjectId: "house",
      payload: {
        level: "simple",
        marginMinutes: 20,
        previous: { level: "always_green", marginMinutes: 15 },
      },
    });
  });

  it("reposer l'état en vigueur n'écrit ni ne journalise rien", async () => {
    const { handler, settings, events } = subject(
      ProductionTrackingSettings.of({ level: "detailed", marginMinutes: 10 }),
    );

    await handler.execute(new SetProductionTrackingCommand("detailed", 10, "staff-1", nextKey()));

    expect(settings.saves).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("rejoué avec la même clé, ne refait pas le geste", async () => {
    const { handler, settings } = subject();
    const key = nextKey();

    await handler.execute(new SetProductionTrackingCommand("simple", 20, "staff-1", key));
    await handler.execute(new SetProductionTrackingCommand("simple", 20, "staff-1", key));

    expect(settings.saves).toHaveLength(1);
  });

  it("refuse une marge hors bornes, sans rien écrire", async () => {
    const { handler, settings } = subject();

    await expect(
      handler.execute(new SetProductionTrackingCommand("simple", 241, "staff-1", nextKey())),
    ).rejects.toBeInstanceOf(InvalidTrackingMarginError);
    expect(settings.saves).toEqual([]);
  });
});

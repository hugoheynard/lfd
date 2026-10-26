import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { QualityControlSettings } from "../../../domain/entities/quality-control-settings.js";
import { InMemoryQualityControlSettings } from "../../__tests__/quality-control-settings-doubles.js";
import { GetQualityControlSettingsHandler } from "../../queries/get-quality-control-settings.handler.js";
import { SetQualityControlSettingsCommand } from "../set-quality-control-settings.command.js";
import { SetQualityControlSettingsHandler } from "../set-quality-control-settings.handler.js";

/** Réglages › Commandes › Contrôle qualité (décision de Hugo, 2026-10-26), ports doublés. */
function subject(posed: QualityControlSettings | null = null) {
  const clock = new FixedClock(new Date());
  const settings = new InMemoryQualityControlSettings(posed);
  const events = new RecordingPublisher();
  const set = new SetQualityControlSettingsHandler(
    settings.reader(),
    settings,
    events,
    clock,
    new DirectUnitOfWork(),
  );
  const get = new GetQualityControlSettingsHandler(settings.reader());
  return { clock, settings, events, set, get };
}

describe("GetQualityControlSettingsHandler", () => {
  it("rend les défauts, et dit qu'ils le sont", async () => {
    const { get } = subject();

    await expect(get.execute()).resolves.toEqual({
      lineChecks: false,
      orderChecks: true,
      source: "default",
    });
  });

  it("rend le réglage posé", async () => {
    const { get } = subject(QualityControlSettings.of({ lineChecks: true, orderChecks: false }));

    await expect(get.execute()).resolves.toEqual({
      lineChecks: true,
      orderChecks: false,
      source: "explicit",
    });
  });
});

describe("SetQualityControlSettingsHandler", () => {
  it("pose le réglage, fige l'auteur et journalise l'avant et l'après", async () => {
    const { set, settings, events, clock } = subject();

    await set.execute(new SetQualityControlSettingsCommand(true, true, "staff_1"));

    expect(settings.writes).toEqual([
      { lineChecks: true, orderChecks: true, at: clock.now(), by: "staff_1" },
    ]);
    expect(events.factTypes()).toEqual(["production_quality_settings.updated"]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "production_quality_settings",
      payload: {
        lineChecks: true,
        orderChecks: true,
        previous: { lineChecks: false, orderChecks: true },
      },
    });
  });

  it("reposer les défauts sur une base vierge n'écrit ni ne journalise rien", async () => {
    const { set, settings, events } = subject();

    await set.execute(new SetQualityControlSettingsCommand(false, true, "staff_1"));

    expect(settings.writes).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("reposer l'état en vigueur garde l'auteur d'origine", async () => {
    const { set, settings } = subject(
      QualityControlSettings.of({ lineChecks: true, orderChecks: false }),
    );

    await set.execute(new SetQualityControlSettingsCommand(true, false, "staff_2"));

    expect(settings.writes).toEqual([]);
  });
});

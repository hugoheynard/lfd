import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { InvalidRoutingSettingError } from "../../../domain/errors/delivery-routing-errors.js";
import { RoutingSettings } from "../../../domain/value-objects/routing-settings.js";
import { GetRoutingSettingsHandler } from "../../queries/get-routing-settings.handler.js";
import { SetRoutingSettingsCommand } from "../set-routing-settings.command.js";
import { SetRoutingSettingsHandler } from "../set-routing-settings.handler.js";
import { DefaultContainerBinTypeUnavailableError } from "../../../domain/errors/delivery-composition-errors.js";
import { binTypeView } from "../../queries/__tests__/packing-doubles.js";
import { FixedBinCatalog } from "./bin-doubles.js";
import { InMemoryRoutingSettings } from "./routing-doubles.js";

const NOW = new Date(0);
const PAYLOAD = {
  detourPercent: 160,
  averageSpeedKmh: 40,
  earliestDeparture: "05:30",
  maxRoundMinutes: 180,
  stopMinutes: 7,
  defaultMode: "insert" as const,
  multiplePassages: false,
  safetyMarginMinutes: 25,
  defaultContainer: null,
  binGapCm: 3,
};
const MANNE = binTypeView("manne");
const OLD = binTypeView("old", { archived: true });

function setter(settings: InMemoryRoutingSettings, events: RecordingPublisher) {
  return new SetRoutingSettingsHandler(
    settings,
    settings.writer,
    new FixedBinCatalog([MANNE, OLD], []),
    new FixedStaffAuthorDirectory(
      authorsKnownAs(
        { firstName: "Hugo", lastName: "H", staffUserId: "staff_1", role: "admin" },
        "staff_1",
      ),
    ),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
}

describe("les réglages du calcul de tournée", () => {
  it("rend les défauts tant que personne n'a réglé", async () => {
    const view = await new GetRoutingSettingsHandler(new InMemoryRoutingSettings()).execute();

    expect(view).toEqual({ ...RoutingSettings.DEFAULTS, source: "default" });
  });

  it("pose les réglages avec leur auteur, et le fait dit « aucun réglage avant »", async () => {
    const settings = new InMemoryRoutingSettings();
    const events = new RecordingPublisher();

    await setter(settings, events).execute(new SetRoutingSettingsCommand(PAYLOAD, "staff_1"));

    expect(settings.written[0]?.author).toEqual({
      staffUserId: "staff_1",
      name: "Hugo H",
      role: "admin",
    });
    expect(await new GetRoutingSettingsHandler(settings).execute()).toEqual({
      ...PAYLOAD,
      source: "explicit",
    });
    expect(events.factTypes()).toEqual(["delivery_routing.settings_updated"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: "Calcul des tournées",
      before: null,
      after: PAYLOAD,
    });
  });

  it("le fait garde l'avant quand on règle de nouveau", async () => {
    const settings = new InMemoryRoutingSettings(RoutingSettings.defaults());
    const events = new RecordingPublisher();

    await setter(settings, events).execute(new SetRoutingSettingsCommand(PAYLOAD, "staff_1"));

    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      before: RoutingSettings.DEFAULTS,
    });
  });

  it("refuse une valeur hors bornes, sans rien écrire ni tracer", async () => {
    const settings = new InMemoryRoutingSettings();
    const events = new RecordingPublisher();

    await expect(
      setter(settings, events).execute(
        new SetRoutingSettingsCommand({ ...PAYLOAD, averageSpeedKmh: 400 }, "staff_1"),
      ),
    ).rejects.toThrow(InvalidRoutingSettingError);
    expect(settings.written).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("sans détour ni vitesse (dépréciés, L10b-C5), garde les valeurs déjà posées", async () => {
    const settings = new InMemoryRoutingSettings(RoutingSettings.define(PAYLOAD));
    const { detourPercent: _detour, averageSpeedKmh: _speed, ...current } = PAYLOAD;

    await setter(settings, new RecordingPublisher()).execute(
      new SetRoutingSettingsCommand({ ...current, stopMinutes: 9 }, "staff_1"),
    );

    expect(await new GetRoutingSettingsHandler(settings).execute()).toMatchObject({
      detourPercent: 160,
      averageSpeedKmh: 40,
      stopMinutes: 9,
    });
  });

  it("sans marge (écran d'avant le lot 7 ter), garde la marge déjà posée", async () => {
    const settings = new InMemoryRoutingSettings(RoutingSettings.define(PAYLOAD));
    const { safetyMarginMinutes: _margin, ...withoutMargin } = PAYLOAD;

    await setter(settings, new RecordingPublisher()).execute(
      new SetRoutingSettingsCommand({ ...withoutMargin, stopMinutes: 9 }, "staff_1"),
    );

    expect(await new GetRoutingSettingsHandler(settings).execute()).toMatchObject({
      safetyMarginMinutes: 25,
      stopMinutes: 9,
    });
  });

  it("sans détour ni vitesse et sans réglage posé, prend les valeurs d'usine", async () => {
    const settings = new InMemoryRoutingSettings();
    const { detourPercent: _detour, averageSpeedKmh: _speed, ...current } = PAYLOAD;

    await setter(settings, new RecordingPublisher()).execute(
      new SetRoutingSettingsCommand(current, "staff_1"),
    );

    expect(await new GetRoutingSettingsHandler(settings).execute()).toMatchObject({
      detourPercent: RoutingSettings.DEFAULTS.detourPercent,
      averageSpeedKmh: RoutingSettings.DEFAULTS.averageSpeedKmh,
    });
  });

  describe("le jeu entre bacs (G5a, 2026-10-08)", () => {
    it("se pose, se relit, et le fait le dit avant et après", async () => {
      const settings = new InMemoryRoutingSettings(RoutingSettings.defaults());
      const events = new RecordingPublisher();

      await setter(settings, events).execute(
        new SetRoutingSettingsCommand({ ...PAYLOAD, binGapCm: 0 }, "staff_1"),
      );

      expect(await new GetRoutingSettingsHandler(settings).execute()).toMatchObject({
        binGapCm: 0,
      });
      expect(events.traced[0]?.journalFact().payload).toMatchObject({
        before: { binGapCm: 1 },
        after: { binGapCm: 0 },
      });
    });

    it("absent (écran d'avant), garde le jeu posé", async () => {
      const settings = new InMemoryRoutingSettings(RoutingSettings.define(PAYLOAD));
      const { binGapCm: _gap, ...withoutGap } = PAYLOAD;

      await setter(settings, new RecordingPublisher()).execute(
        new SetRoutingSettingsCommand({ ...withoutGap, stopMinutes: 9 }, "staff_1"),
      );

      expect((await settings.current())?.binGapCm).toBe(3);
    });

    it("refuse un jeu hors de 0 à 10 cm, sans rien écrire", async () => {
      const settings = new InMemoryRoutingSettings();

      await expect(
        setter(settings, new RecordingPublisher()).execute(
          new SetRoutingSettingsCommand({ ...PAYLOAD, binGapCm: 11 }, "staff_1"),
        ),
      ).rejects.toThrow("jeu entre bacs");
      expect(settings.written).toEqual([]);
    });
  });

  describe("le contenant par défaut d'une commande (2026-10-06)", () => {
    const WITH_MANNE = { ...PAYLOAD, defaultContainer: { binTypeId: "manne", count: 2 } };

    it("se pose, se relit, et le fait cite le type avec son nom", async () => {
      const settings = new InMemoryRoutingSettings();
      const events = new RecordingPublisher();

      await setter(settings, events).execute(new SetRoutingSettingsCommand(WITH_MANNE, "staff_1"));

      expect(await new GetRoutingSettingsHandler(settings).execute()).toMatchObject({
        defaultContainer: { binTypeId: "manne", count: 2 },
      });
      expect(events.traced[0]?.journalFact().payload).toMatchObject({
        after: { defaultContainer: { binType: { id: "manne", name: "Bac manne" }, count: 2 } },
      });
    });

    it("absent (écran d'avant), garde le contenant posé ; `null` le vide", async () => {
      const settings = new InMemoryRoutingSettings(RoutingSettings.define(WITH_MANNE));
      const { defaultContainer: _container, ...withoutContainer } = PAYLOAD;

      await setter(settings, new RecordingPublisher()).execute(
        new SetRoutingSettingsCommand({ ...withoutContainer, stopMinutes: 9 }, "staff_1"),
      );
      expect((await settings.current())?.defaultContainer).toEqual({
        binTypeId: "manne",
        count: 2,
      });

      await setter(settings, new RecordingPublisher()).execute(
        new SetRoutingSettingsCommand(PAYLOAD, "staff_1"),
      );
      expect((await settings.current())?.defaultContainer).toBeNull();
    });

    it("refuse un type archivé ou inconnu, sans rien écrire ni tracer", async () => {
      for (const binTypeId of ["old", "nope"]) {
        const settings = new InMemoryRoutingSettings();
        const events = new RecordingPublisher();

        await expect(
          setter(settings, events).execute(
            new SetRoutingSettingsCommand(
              { ...PAYLOAD, defaultContainer: { binTypeId, count: 1 } },
              "staff_1",
            ),
          ),
        ).rejects.toThrow(DefaultContainerBinTypeUnavailableError);
        expect(settings.written).toEqual([]);
        expect(events.traced).toEqual([]);
      }
    });

    it("refuse un nombre hors de 1 à 50", async () => {
      for (const count of [0, 51, 1.5]) {
        await expect(
          setter(new InMemoryRoutingSettings(), new RecordingPublisher()).execute(
            new SetRoutingSettingsCommand(
              { ...PAYLOAD, defaultContainer: { binTypeId: "manne", count } },
              "staff_1",
            ),
          ),
        ).rejects.toThrow(InvalidRoutingSettingError);
      }
    });
  });
});

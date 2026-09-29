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
};

function setter(settings: InMemoryRoutingSettings, events: RecordingPublisher) {
  return new SetRoutingSettingsHandler(
    settings,
    settings.writer,
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
});

import { buildSegmentation } from "../services/audience-board.js";
import { AUDIENCE_DIMENSION_RULES } from "../audience-dimensions.js";
import {
  SETTLED_MIN_DISTINCT_WEEKS,
  stayProfileOf,
  staySignalsKey,
  staySignalsOf,
  VACATION_MAX_SPAN_DAYS,
  type StaySignals,
} from "../stay-profiles.js";

const signals = (over: Partial<StaySignals> = {}): StaySignals => ({
  foreign: false,
  spanDays: 0,
  distinctWeeks: 1,
  ...over,
});

describe("le profil de séjour estimé", () => {
  it("vacancier : un signal étranger et tout en dix jours au plus", () => {
    expect(stayProfileOf(signals({ foreign: true, spanDays: 0 }))).toBe("vacationer");
    expect(stayProfileOf(signals({ foreign: true, spanDays: VACATION_MAX_SPAN_DAYS }))).toBe(
      "vacationer",
    );
  });

  it("onze jours d'écart ne font plus un séjour", () => {
    expect(stayProfileOf(signals({ foreign: true, spanDays: VACATION_MAX_SPAN_DAYS + 1 }))).toBe(
      "undetermined",
    );
  });

  it("vacancier l'emporte sur trois semaines tenues dans dix jours", () => {
    expect(stayProfileOf(signals({ foreign: true, spanDays: 9, distinctWeeks: 3 }))).toBe(
      "vacationer",
    );
  });

  it("résident : trois semaines distinctes, rien d'étranger", () => {
    expect(
      stayProfileOf(signals({ spanDays: 20, distinctWeeks: SETTLED_MIN_DISTINCT_WEEKS })),
    ).toBe("resident");
  });

  it("deux semaines ne suffisent pas", () => {
    expect(
      stayProfileOf(signals({ spanDays: 20, distinctWeeks: SETTLED_MIN_DISTINCT_WEEKS - 1 })),
    ).toBe("undetermined");
  });

  it("saisonnier : trois semaines et un signal étranger, hors d'un séjour court", () => {
    expect(stayProfileOf(signals({ foreign: true, spanDays: 40, distinctWeeks: 5 }))).toBe(
      "seasonal",
    );
  });

  it("indéterminé : un client français d'une seule commande", () => {
    expect(stayProfileOf(signals())).toBe("undetermined");
  });

  it("relit la clé brute que la base compose", () => {
    const raw = signals({ foreign: true, spanDays: 12, distinctWeeks: 4 });
    expect(staySignalsOf(staySignalsKey(raw))).toEqual(raw);
    expect(staySignalsOf("2-1-1")).toBeNull();
    expect(staySignalsOf("")).toBeNull();
  });

  it("nomme la case d'une clé brute, et les cases sont toutes montrées", () => {
    const rule = AUDIENCE_DIMENSION_RULES.stay_profile;
    expect(rule.cellOf("1-3-1", null).label).toBe("Vacancier (estimé)");
    expect(rule.cellOf("0-30-5", null).key).toBe("resident");
    expect(rule.canonical.map((cell) => cell.key)).toEqual([
      "resident",
      "seasonal",
      "vacationer",
      "undetermined",
    ]);
  });
});

describe("la langue de la commande", () => {
  it("range une commande sans langue dans « non renseignée »", () => {
    const rule = AUDIENCE_DIMENSION_RULES.order_locale;
    expect(rule.cellOf("", null).key).toBe("unknown");
    expect(rule.cellOf("en", null).label).toBe("Anglais");
  });
});

describe("le profil de séjour, une fois regroupé", () => {
  const tally = (rawKey: string, clients: number) => ({
    rawKey,
    rawLabel: null,
    clients,
    orders: clients,
    revenueHtCents: clients * 1_000,
    revenueTtcCents: clients * 1_100,
  });

  it("additionne les clients de plusieurs clés brutes d'un même profil, et masque sous 5", () => {
    const view = buildSegmentation(
      "stay_profile",
      [tally("1-0-1", 3), tally("1-6-2", 2), tally("0-30-5", 4)],
      [],
      new Map(),
    );

    const byKey = new Map(view.cells.map((cell) => [cell.key, cell]));
    expect(byKey.get("vacationer")).toMatchObject({ status: "shown", clients: 5 });
    expect(byKey.get("resident")).toEqual({
      status: "too_few_clients",
      key: "resident",
      label: "Résident (estimé)",
    });
    expect(byKey.get("seasonal")?.status).toBe("too_few_clients");
  });
});

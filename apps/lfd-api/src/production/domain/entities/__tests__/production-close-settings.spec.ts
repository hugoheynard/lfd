import {
  AlertTimeRequiredError,
  CloseTimeBeforeOrderCutoffError,
  CloseTimeOutOfRangeError,
  CloseTimeRequiredError,
  InvalidHouseTimeError,
} from "../../errors/production-settings-errors.js";
import type { LatestOrderCutoff } from "../../services/latest-order-cutoff.js";
import { HouseTime } from "../../value-objects/house-time.value-object.js";
import {
  type CloseSettingsRequest,
  ProductionCloseSettings,
} from "../production-close-settings.js";

const AT = new Date(0);
const BY = "staff-1";
const EVE_18H: LatestOrderCutoff = { daysBefore: 1, time: HouseTime.of("18:00", "close") };

const auto = (closeAt: string | null, alertAt: string | null = null): CloseSettingsRequest => ({
  mode: "auto",
  closeAt,
  alertAt,
});
const manual = (alertAt: string | null, closeAt: string | null = null): CloseSettingsRequest => ({
  mode: "manual",
  closeAt,
  alertAt,
});

describe("ProductionCloseSettings — l'arrêt du plan", () => {
  it("part en manuel, alerte à 20:00 (Q1)", () => {
    expect(ProductionCloseSettings.initial().values).toEqual({
      mode: "manual",
      closeAt: null,
      alertAt: "20:00",
    });
  });

  it("passe en automatique, et rend l'avant et l'après", () => {
    const settings = ProductionCloseSettings.initial();

    const change = settings.change(auto("21:00", "20:00"), EVE_18H, BY, AT);

    expect(change).toEqual({
      before: { mode: "manual", closeAt: null, alertAt: "20:00" },
      after: { mode: "auto", closeAt: "21:00", alertAt: "20:00" },
    });
    expect(settings.values.mode).toBe("auto");
    expect(settings.updatedBy).toBe(BY);
    expect(settings.updatedAt).toBe(AT);
  });

  it("un réglage reposé à l'identique ne change rien", () => {
    const settings = ProductionCloseSettings.initial();

    expect(settings.change(manual("20:00"), null, BY, AT)).toBeNull();
    expect(settings.updatedBy).toBeNull();
  });

  it("refuse l'automatique sans heure d'arrêt", () => {
    expect(() => ProductionCloseSettings.initial().change(auto(null), null, BY, AT)).toThrow(
      CloseTimeRequiredError,
    );
  });

  it("refuse le manuel sans heure d'alerte", () => {
    expect(() => ProductionCloseSettings.initial().change(manual(null), null, BY, AT)).toThrow(
      AlertTimeRequiredError,
    );
  });

  it.each([
    ["l'heure d'arrêt", auto("21h")],
    ["l'heure d'alerte", manual("25:00")],
    ["l'heure gardée de l'autre mode", manual("20:00", "9:00")],
  ])("refuse une heure mal formée — %s", (_case, request) => {
    expect(() => ProductionCloseSettings.initial().change(request, null, BY, AT)).toThrow(
      InvalidHouseTimeError,
    );
  });

  it.each(["11:59", "23:56", "00:30"])(
    "refuse une heure d'arrêt hors de 12:00–23:55 : %s",
    (closeAt) => {
      expect(() => ProductionCloseSettings.initial().change(auto(closeAt), null, BY, AT)).toThrow(
        CloseTimeOutOfRangeError,
      );
    },
  );

  it.each(["12:00", "23:55"])("admet les bornes : %s", (closeAt) => {
    expect(ProductionCloseSettings.initial().change(auto(closeAt), null, BY, AT)).not.toBeNull();
  });

  it("refuse une heure d'arrêt automatique antérieure à l'heure limite (Q5), en la nommant", () => {
    const attempt = () => ProductionCloseSettings.initial().change(auto("17:30"), EVE_18H, BY, AT);

    expect(attempt).toThrow(CloseTimeBeforeOrderCutoffError);
    expect(attempt).toThrow(/17:30 tombe avant .*la veille à 18:00/u);
  });

  it("admet une heure d'arrêt égale à l'heure limite", () => {
    expect(ProductionCloseSettings.initial().change(auto("18:00"), EVE_18H, BY, AT)).not.toBeNull();
  });

  it("en manuel, l'heure limite ne juge pas l'heure d'arrêt gardée", () => {
    expect(
      ProductionCloseSettings.initial().change(manual("19:00", "13:00"), EVE_18H, BY, AT),
    ).not.toBeNull();
  });
});

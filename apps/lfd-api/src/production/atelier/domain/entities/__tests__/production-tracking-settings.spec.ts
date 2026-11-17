import { InvalidTrackingMarginError } from "../../errors/tracking-errors.js";
import {
  MAX_TRACKING_MARGIN_MINUTES,
  ProductionTrackingSettings,
} from "../production-tracking-settings.js";

describe("ProductionTrackingSettings — le niveau de suivi du fournil", () => {
  it("par défaut : toujours vert, un quart d'heure de marge", () => {
    expect(ProductionTrackingSettings.defaults()).toMatchObject({
      level: "always_green",
      marginMinutes: 15,
    });
  });

  it("admet une marge nulle et la borne haute", () => {
    expect(ProductionTrackingSettings.of({ level: "simple", marginMinutes: 0 }).marginMinutes).toBe(
      0,
    );
    expect(
      ProductionTrackingSettings.of({
        level: "detailed",
        marginMinutes: MAX_TRACKING_MARGIN_MINUTES,
      }).marginMinutes,
    ).toBe(MAX_TRACKING_MARGIN_MINUTES);
  });

  it.each([-1, MAX_TRACKING_MARGIN_MINUTES + 1, 7.5, Number.NaN])(
    "refuse une marge de %p minutes, en nommant la borne",
    (marginMinutes) => {
      expect(() => ProductionTrackingSettings.of({ level: "simple", marginMinutes })).toThrow(
        InvalidTrackingMarginError,
      );
    },
  );

  it("compare deux états par leurs valeurs", () => {
    const settings = ProductionTrackingSettings.of({ level: "simple", marginMinutes: 20 });

    expect(settings.equals({ level: "simple", marginMinutes: 20 })).toBe(true);
    expect(settings.equals({ level: "simple", marginMinutes: 15 })).toBe(false);
    expect(settings.equals({ level: "detailed", marginMinutes: 20 })).toBe(false);
  });
});

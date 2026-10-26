import { ensureServiceDayNotPast } from "../composable-day.js";
import { PastServiceDayCompositionError } from "../../errors/delivery-round-removal-errors.js";

// Des jours comparés entre eux seulement : `today` est donné, jamais lu à l'horloge.
describe("ensureServiceDayNotPast", () => {
  it("laisse composer aujourd'hui et les jours à venir", () => {
    expect(() => ensureServiceDayNotPast("2030-03-12", "2030-03-12")).not.toThrow();
    expect(() => ensureServiceDayNotPast("2030-03-13", "2030-03-12")).not.toThrow();
  });

  it("refuse une journée passée, en le disant", () => {
    expect(() => ensureServiceDayNotPast("2030-03-11", "2030-03-12")).toThrow(
      PastServiceDayCompositionError,
    );
    expect(() => ensureServiceDayNotPast("2029-12-31", "2030-01-01")).toThrow(
      /On ne compose pas une journée passée/u,
    );
  });
});

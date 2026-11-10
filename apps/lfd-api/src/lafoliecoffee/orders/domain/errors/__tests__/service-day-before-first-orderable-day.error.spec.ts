import {
  frenchServiceDayOf,
  ServiceDayBeforeFirstOrderableDayError,
} from "../service-day-before-first-orderable-day.error.js";

/** Le refus est lu par du personnel et des clients : la date se dit comme on la lit. */
describe("ServiceDayBeforeFirstOrderableDayError", () => {
  it("dit la journée en français, jour de semaine compris", () => {
    expect(frenchServiceDayOf("2026-10-29")).toBe("jeudi 29 octobre");
    expect(frenchServiceDayOf("2027-03-01")).toBe("lundi 1er mars");
  });

  it("nomme la clientèle, la date et le geste de sortie, en 409", () => {
    const error = new ServiceDayBeforeFirstOrderableDayError("b2c", "2026-10-29");

    expect(error.message).toBe(
      "Les commandes des particuliers sont ouvertes pour le jeudi 29 octobre et les jours suivants. Choisissez cette date ou une suivante.",
    );
    expect(error.code).toBe("orders.service_day_before_first_orderable_day");
  });
});

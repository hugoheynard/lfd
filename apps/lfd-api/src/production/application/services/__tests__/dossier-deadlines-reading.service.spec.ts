import { ProductionTrancheSettings, ServiceDay } from "../../../day/index.js";
import { FixedDueThresholds, NO_DUE } from "../../__tests__/due-thresholds-doubles.js";
import { InMemoryTrancheSettings } from "../../__tests__/production-tranche-settings-doubles.js";
import { DossierDeadlinesReading } from "../dossier-deadlines-reading.service.js";

const DAY = ServiceDay.of("2030-03-12");
const DUE = {
  ...NO_DUE,
  items: [
    {
      sku: "CRO",
      productName: "Croissant",
      total: 10,
      thresholds: [{ kind: "deadline" as const, before: "06:40", quantity: 10, cumulative: 10 }],
    },
  ],
};
const POSED = ProductionTrancheSettings.set("fixed", ["05:00", "07:00"]);

const Reading = DossierDeadlinesReading;

describe("DossierDeadlinesReading — le dossier (plan) : les tranches du jour, lues au commerce et rangées par la règle du noyau", () => {
  it("range les besoins du commerce selon le réglage posé", async () => {
    const reading = new Reading(
      new FixedDueThresholds(DUE),
      new InMemoryTrancheSettings(POSED).reader(),
    );

    const ranged = await reading.read(DAY);

    expect(ranged?.get("CRO")).toEqual([
      { kind: "deadline", before: "05:00", quantity: 10, cumulative: 10 },
    ]);
  });

  it("un commerce injoignable rend `null`, sans lever", async () => {
    const reading = new Reading(
      new FixedDueThresholds("down"),
      new InMemoryTrancheSettings().reader(),
    );

    await expect(reading.read(DAY)).resolves.toBeNull();
  });
});

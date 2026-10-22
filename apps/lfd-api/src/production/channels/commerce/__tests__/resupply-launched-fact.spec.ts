import { ResupplyLaunchedEvent, ResupplyLaunchedPayloadError } from "../resupply-launched.event.js";

/**
 * Le contrat du fait `production.resupply_launched` (R4a) : ce que l'abonné
 * relit est ce que le fournil a écrit, et un payload hors forme est refusé
 * plutôt que deviné. Instants recopiés, jamais comparés à l'horloge.
 */
const AT = new Date("2026-09-08T07:30:00.000Z");
const RESUPPLY = {
  resupplyId: "rs_asap",
  siteId: "site_labo",
  siteLabel: null,
  name: null,
  servedByTransfer: false,
  lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 8 }],
};

describe("ResupplyLaunchedEvent", () => {
  it("va et revient par son payload, nom absent compris", () => {
    const fact = new ResupplyLaunchedEvent("2026-09-08", AT, "s_max", null, RESUPPLY).durableFact();

    expect(ResupplyLaunchedEvent.fromPayload(fact.payload)).toEqual(
      new ResupplyLaunchedEvent("2026-09-08", AT, "s_max", null, RESUPPLY),
    );
  });

  it("refuse un payload sans `servedByTransfer` ou sans ligne", () => {
    const fact = new ResupplyLaunchedEvent(
      "2026-09-08",
      AT,
      "s_max",
      "Max",
      RESUPPLY,
    ).durableFact();
    const { servedByTransfer: _gone, ...withoutServed } = RESUPPLY;

    expect(() =>
      ResupplyLaunchedEvent.fromPayload({ ...fact.payload, resupply: withoutServed }),
    ).toThrow(ResupplyLaunchedPayloadError);
    expect(() =>
      ResupplyLaunchedEvent.fromPayload({ ...fact.payload, resupply: { ...RESUPPLY, lines: [] } }),
    ).toThrow(ResupplyLaunchedPayloadError);
  });
});

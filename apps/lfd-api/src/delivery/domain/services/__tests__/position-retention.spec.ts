import { POSITION_RETENTION_DAYS, positionKeptSince } from "../position-retention.js";

describe("positionKeptSince — la frontière de la purge des positions", () => {
  it("vaut 60 jours (Hugo, 2026-10-06)", () => {
    expect(POSITION_RETENTION_DAYS).toBe(60);
  });

  it("recule de 60 jours exactement depuis maintenant", () => {
    const now = new Date(100 * 24 * 60 * 60 * 1000);

    expect(positionKeptSince(now)).toEqual(new Date(40 * 24 * 60 * 60 * 1000));
  });
});

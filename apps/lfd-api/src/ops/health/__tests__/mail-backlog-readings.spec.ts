import { mailBacklogReadings } from "../mail-backlog-readings.js";

const QUIET = {
  stalled: 0,
  oldestStalledMinutes: null,
  definitiveFailures: 0,
  stalledAfterMinutes: 15,
};

describe("la veille du courrier sur la carte de santé (plan des e-mails, § 25)", () => {
  it("affiche les deux relevés même à zéro : une file vide est une mesure", () => {
    const readings = mailBacklogReadings(QUIET);

    expect(readings.map((reading) => [reading.label, reading.value])).toEqual([
      ["En attente", 0],
      ["Échecs définitifs", 0],
    ]);
    expect(readings[0]?.hint).toContain("la boîte d'envoi part");
  });

  it("une file coincée dit l'âge du plus ancien et le diagnostic", () => {
    const readings = mailBacklogReadings({ ...QUIET, stalled: 7, oldestStalledMinutes: 42 });

    expect(readings[0]).toMatchObject({ label: "En attente", value: 7 });
    expect(readings[0]?.hint).toContain("depuis 42 min : la boîte d'envoi ne part plus");
  });

  it("des échecs définitifs disent qu'ils ne repartiront pas seuls", () => {
    const readings = mailBacklogReadings({ ...QUIET, definitiveFailures: 2 });

    expect(readings[1]).toMatchObject({ value: 2 });
    expect(readings[1]?.hint).toContain("ne repartiront pas seuls");
  });
});

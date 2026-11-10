import { retainedQuantity } from "../volume-commitment.js";
import type { VolumeCommitment } from "../volume-commitment.js";

const commitment: VolumeCommitment = {
  id: "commitment_1",
  companyId: "company_1",
  scope: { type: "product", id: "PAI-001" },
  promisedQuantity: 10_000,
  validFrom: new Date("2026-09-01T00:00:00.000Z"),
  validTo: new Date("2027-06-30T00:00:00.000Z"),
};

describe("retainedQuantity", () => {
  /**
   * La story : « ma saison, c'est 10 000 baguettes ». Le prix négocié doit être
   * là à la PREMIÈRE commande, sinon on n'a pas vendu ce qu'on a dit.
   */
  it("ouvre le palier du volume annoncé dès la première commande", () => {
    expect(retainedQuantity(commitment, 500)).toBe(10_000);
  });

  it("laisse le livré reprendre la main dès qu'il dépasse la promesse", () => {
    // Sinon, dépasser son engagement coûterait un palier — l'inverse de ce
    // qu'un barème de volume encourage.
    expect(retainedQuantity(commitment, 12_000)).toBe(12_000);
  });

  it("vaut la promesse à l'ouverture, quand rien n'a encore été livré", () => {
    expect(retainedQuantity(commitment, 0)).toBe(10_000);
  });
});

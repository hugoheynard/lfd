import { staffActionSchema, staffResourceSchema } from "../staff-access.js";
import { STAFF_RESOURCE_SCOPES } from "../staff-resource-scopes.js";

describe("STAFF_RESOURCE_SCOPES — ce que chaque droit ouvre", () => {
  it("décrit chaque ressource du contrat, et aucune autre", () => {
    // Le `Record` casse déjà la compilation sur un oubli ; ceci tient le sens
    // inverse — une clé morte restée après le retrait d'une ressource.
    expect(Object.keys(STAFF_RESOURCE_SCOPES).sort()).toEqual(
      [...staffResourceSchema.options].sort(),
    );
  });

  it("dit quelque chose pour chaque niveau, lecture comme écriture", () => {
    // Un niveau qui n'ouvre rien le DIT : une phrase vide se lirait comme un oubli.
    for (const resource of staffResourceSchema.options) {
      for (const action of staffActionSchema.options) {
        expect(STAFF_RESOURCE_SCOPES[resource][action].trim().length).toBeGreaterThan(10);
      }
    }
  });

  it("finit chaque phrase par un point, pour qu'elle se lise comme une phrase", () => {
    for (const resource of staffResourceSchema.options) {
      for (const action of staffActionSchema.options) {
        expect(STAFF_RESOURCE_SCOPES[resource][action]).toMatch(/[.»]$/u);
      }
    }
  });

  it("ne recopie pas la lecture dans l'écriture", () => {
    for (const resource of staffResourceSchema.options) {
      const scope = STAFF_RESOURCE_SCOPES[resource];
      expect(scope.write).not.toBe(scope.read);
    }
  });
});

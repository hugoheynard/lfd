import { InvalidSiretError } from "../../errors/account-errors.js";
import { Siret, SIRET_LENGTH } from "../siret.js";

/** SIRET dont la clé de Luhn est correcte (celui du client de démonstration). */
const VALID = "81245678900021";

describe("Siret", () => {
  it("normalise la saisie espacée en 14 chiffres", () => {
    // Les gens saisissent le SIRET par groupes ; stocker la forme brute
    // laisserait passer deux fois le même établissement.
    expect(Siret.create("812 456 789 00021").value).toBe(VALID);
  });

  it("expose une forme lisible pour l'affichage", () => {
    expect(Siret.create(VALID).formatted()).toBe("812 456 789 00021");
  });

  it("refuse ce qui n'est pas 14 chiffres", () => {
    expect(() => Siret.create("8124567890002")).toThrow(InvalidSiretError);
    expect(() => Siret.create("812456789000211")).toThrow(InvalidSiretError);
    expect(() => Siret.create("81245678900O21")).toThrow(/chiffres uniquement/u);
  });

  it("détecte TOUTE faute de frappe sur un seul chiffre", () => {
    // La propriété qui justifie la clé de contrôle : c'est exactement l'erreur
    // humaine la plus fréquente. La vérifier ainsi, plutôt que sur deux exemples
    // choisis, prouve l'implémentation entière sans dépendre d'un SIRET réel.
    for (let position = 0; position < SIRET_LENGTH; position++) {
      const original = Number(VALID[position]);
      for (let digit = 0; digit <= 9; digit++) {
        if (digit === original) {
          continue;
        }
        const altered = `${VALID.slice(0, position)}${String(digit)}${VALID.slice(position + 1)}`;
        expect(() => Siret.create(altered)).toThrow(InvalidSiretError);
      }
    }
  });

  it("détecte l'inversion de deux chiffres voisins", () => {
    // L'autre faute humaine classique. Luhn l'attrape sauf pour la paire 0/9,
    // exception connue de l'algorithme : on ne l'exige donc pas.
    for (let position = 0; position < SIRET_LENGTH - 1; position++) {
      const [a, b] = [VALID[position], VALID[position + 1]];
      if (a === b || (a === "0" && b === "9") || (a === "9" && b === "0")) {
        continue;
      }
      const swapped = `${VALID.slice(0, position)}${String(b)}${String(a)}${VALID.slice(position + 2)}`;
      expect(() => Siret.create(swapped)).toThrow(InvalidSiretError);
    }
  });
});

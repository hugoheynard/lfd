import { ulid } from "ulid";

import { referenceFrom } from "../reference.js";

/** L'alphabet lisible — redéclaré ICI pour que le test contraigne le module. */
const READABLE = /^[A-HJ-NP-Z2-9]{6}$/u;

describe("referenceFrom", () => {
  it("dérive une référence de 6 symboles préfixée", () => {
    const reference = referenceFrom("R", ulid());

    expect(reference).toMatch(/^R-[A-HJ-NP-Z2-9]{6}$/u);
  });

  it("est déterministe — un rejeu n'invente pas une seconde identité", () => {
    const id = ulid();

    expect(referenceFrom("P", id)).toBe(referenceFrom("P", id));
  });

  it("n'emploie jamais un symbole ambigu, quel que soit l'identifiant", () => {
    for (let draw = 0; draw < 200; draw += 1) {
      const code = referenceFrom("C", ulid()).slice(2);

      expect(code).toMatch(READABLE);
    }
  });

  it("lit la QUEUE de l'identifiant — deux ULID de la même milliseconde diffèrent", () => {
    const instant = Date.now();
    const references = new Set(Array.from({ length: 50 }, () => referenceFrom("R", ulid(instant))));

    expect(references.size).toBe(50);
  });

  it("tolère un identifiant qui n'est pas un ULID — le générateur de test en rend", () => {
    expect(referenceFrom("C", "id_000001")).toMatch(/^C-[A-HJ-NP-Z2-9]{6}$/u);
  });

  // Parcourt les 32 symboles atteignables plutôt que d'inspecter un code au
  // hasard : un `O` planqué dans l'alphabet passerait sous un tirage unique.
  it("couvre les 32 symboles, et aucun ambigu", () => {
    const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const symbols = new Set([...crockford].map((last) => referenceFrom("R", last).slice(-1)));

    expect(symbols.size).toBe(32);
    expect([...symbols].join("")).not.toMatch(/[IO01]/u);
  });

  it("complète un identifiant plus court que le code", () => {
    expect(referenceFrom("R", "7")).toMatch(/^R-[A-HJ-NP-Z2-9]{6}$/u);
  });
});

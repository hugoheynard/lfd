import { readKeyOf } from "../vitrine-read-key.js";

describe("la clé de lecture d'une requête vitrine", () => {
  it("prend l'en-tête quand il est là", () => {
    expect(readKeyOf("cle-entete", "cle-url")).toBe("cle-entete");
  });

  /**
   * Régression : l'outil d'import de l'agence ne pose pas d'en-tête, et une
   * clé valide était refusée en 403 (2026-10-21).
   */
  it("prend le paramètre d'URL quand l'en-tête manque ou est vide", () => {
    expect(readKeyOf(undefined, "cle-url")).toBe("cle-url");
    expect(readKeyOf("  ", "cle-url")).toBe("cle-url");
  });

  it("retire les blancs autour, retour à la ligne compris", () => {
    expect(readKeyOf(" cle-entete\n", undefined)).toBe("cle-entete");
    expect(readKeyOf(undefined, "\tcle-url ")).toBe("cle-url");
  });

  it("rend une clé absente quand aucun des deux n'est là", () => {
    expect(readKeyOf(undefined, undefined)).toBeUndefined();
  });
});

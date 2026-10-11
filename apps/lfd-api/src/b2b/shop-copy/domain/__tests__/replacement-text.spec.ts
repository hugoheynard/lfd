import {
  lengthCeilingOf,
  MIN_LENGTH_CEILING,
  validReplacement,
  variablesOf,
} from "../replacement-text.js";
import { InvalidShopCopyTextError } from "../shop-copy-errors.js";
import { CART_TITLE, GREETING } from "./shop-copy-fixtures.js";

describe("un remplacement de texte", () => {
  it("passe quand il garde ses variables, même déplacées", () => {
    expect(validReplacement(GREETING, "fr", "{name}, bonjour !")).toBe("{name}, bonjour !");
  });

  it("refuse un texte vide ou fait d'espaces — vider, c'est revenir à l'original", () => {
    expect(() => validReplacement(CART_TITLE, "fr", "   ")).toThrow(InvalidShopCopyTextError);
    expect(() => validReplacement(CART_TITLE, "fr", "")).toThrow(/Revenir à l'original/u);
  });

  it("refuse une variable perdue", () => {
    expect(() => validReplacement(GREETING, "fr", "Bonjour.")).toThrow(/\{name\}/u);
  });

  it("refuse une variable ajoutée ou renommée", () => {
    expect(() => validReplacement(GREETING, "fr", "Bonjour {name} {points}")).toThrow(
      InvalidShopCopyTextError,
    );
    expect(() => validReplacement(GREETING, "fr", "Bonjour {nom}")).toThrow(/\{nom\}/u);
  });

  it("borne la longueur à quatre fois l'original, et au moins 160 caractères", () => {
    expect(lengthCeilingOf("Panier")).toBe(MIN_LENGTH_CEILING);
    expect(lengthCeilingOf("x".repeat(100))).toBe(400);
    expect(validReplacement(CART_TITLE, "fr", "p".repeat(160))).toHaveLength(160);
    expect(() => validReplacement(CART_TITLE, "fr", "p".repeat(161))).toThrow(/161 caractères/u);
  });

  it("compte les caractères, pas les unités UTF-16", () => {
    expect(validReplacement(CART_TITLE, "fr", "🥐".repeat(160))).toHaveLength(320);
  });

  it("refuse une balise : la boutique affiche du texte brut", () => {
    expect(() => validReplacement(CART_TITLE, "fr", "<b>Panier</b>")).toThrow(/balise/u);
    expect(() => validReplacement(CART_TITLE, "fr", "Panier <!-- x -->")).toThrow(/balise/u);
  });

  it("laisse passer un chevron qui n'ouvre aucune balise", () => {
    expect(validReplacement(CART_TITLE, "fr", "Moins de 3 < 5 articles")).toBe(
      "Moins de 3 < 5 articles",
    );
  });

  it("lit les variables triées, sans doublon", () => {
    expect(variablesOf("{b} et {a} puis {b}")).toEqual(["a", "b"]);
  });
});

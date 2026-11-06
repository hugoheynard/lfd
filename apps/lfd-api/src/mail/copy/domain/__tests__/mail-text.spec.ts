import { InvalidMailTextError } from "../mail-copy-errors.js";
import { keepsVariables, validMailText, variablesOf } from "../mail-text.js";
import { KICKER, SUBJECT, TITLE } from "./mail-copy-fixtures.js";

describe("un texte d'e-mail réécrit (C5)", () => {
  it("lit les variables d'un texte, triées et sans doublon", () => {
    expect(variablesOf("{ref} et {day}, encore {ref}")).toEqual(["day", "ref"]);
  });

  it("accepte un texte qui garde l'obligatoire, et un permis omis", () => {
    expect(validMailText(SUBJECT, "Merci pour {ref}")).toBe("Merci pour {ref}");
    expect(validMailText(TITLE, "Bonjour à vous,")).toBe("Bonjour à vous,");
    expect(validMailText(TITLE, "Bonjour {firstName},")).toBe("Bonjour {firstName},");
  });

  it("refuse un texte vide, en nommant le geste de sortie", () => {
    expect(() => validMailText(KICKER, "   ")).toThrow(InvalidMailTextError);
    expect(() => validMailText(KICKER, "")).toThrow(/Rétablir le texte d'origine/u);
  });

  it("refuse une variable obligatoire perdue, et liste les permises", () => {
    expect(() => validMailText(SUBJECT, "Votre commande")).toThrow(
      "Le texte « subject » de l'e-mail « customer.order-placed » ne peut pas être enregistré : il manque {ref}, obligatoire. Variables permises : {ref}.",
    );
  });

  it("refuse une variable inconnue, et dit qu'un texte n'en accepte aucune", () => {
    expect(() => validMailText(KICKER, "Confirmée {ref}")).toThrow(
      "{ref} n'est pas une variable de ce texte. Ce texte n'accepte aucune variable.",
    );
    expect(() => validMailText(SUBJECT, "{total} — {ref}")).toThrow(
      "{total} n'est pas une variable de ce texte. Variables permises : {ref}.",
    );
  });

  it("dit les deux fautes ensemble", () => {
    expect(() => validMailText(SUBJECT, "Commande {total}")).toThrow(
      "il manque {ref}, obligatoire ; {total} n'est pas une variable de ce texte.",
    );
  });

  it("`keepsVariables` dit la même chose sans lever", () => {
    expect(keepsVariables(SUBJECT, "{ref}")).toBe(true);
    expect(keepsVariables(SUBJECT, "rien")).toBe(false);
    expect(keepsVariables(KICKER, "{x}")).toBe(false);
  });
});

import { LOCALES } from "@lfd/pim-contracts";

import { localizedColumn, optionalLocalizedColumn } from "../json-readers.js";

describe("localizedColumn — l'écriture d'une colonne localisée", () => {
  /**
   * La panne que ce test ferme : la fonction listait `fr` et `en` en dur. Quand
   * l'italien est entré dans `LOCALES`, il a été jeté à CHAQUE écriture, en
   * silence — noms de familles, textes de fiches, alternatives d'image. L'écran
   * l'affichait, l'enregistrement l'acceptait, et la relecture rendait deux
   * langues sur trois.
   */
  it("écrit TOUTES les langues renseignées", () => {
    expect(localizedColumn({ fr: "Pain", en: "Bread", it: "Pane" })).toEqual({
      fr: "Pain",
      en: "Bread",
      it: "Pane",
    });
  });

  it("n'écrit pas une langue absente", () => {
    expect(localizedColumn({ fr: "Pain" })).toEqual({ fr: "Pain" });
  });

  it("traite une traduction vide comme absente", () => {
    // Une chaîne vide n'est pas une traduction : la garder ferait passer la
    // fiche pour traduite auprès de tout ce qui compte les langues remplies.
    expect(localizedColumn({ fr: "Pain", en: "   " })).toEqual({ fr: "Pain" });
  });

  /**
   * Le vrai garde-fou : il échouera le jour où une quatrième langue entrera
   * dans le contrat sans que l'écriture la suive. Un test qui cite `it` en dur
   * n'aurait rien dit de plus que le précédent.
   */
  it("suit LOCALES, quelle que soit la liste", () => {
    const complet = {
      ...Object.fromEntries(LOCALES.map((locale) => [locale, `texte-${locale}`])),
      fr: "texte-fr",
    };
    expect(Object.keys(localizedColumn(complet)).sort()).toEqual([...LOCALES].sort());
  });

  it("fait l'aller-retour avec la lecture", () => {
    const texte = { fr: "Pain", it: "Pane" };
    expect(optionalLocalizedColumn(localizedColumn(texte))).toEqual(texte);
  });
});

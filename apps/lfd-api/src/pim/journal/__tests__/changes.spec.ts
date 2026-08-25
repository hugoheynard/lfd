import { changesBetween } from "../changes.js";

/**
 * Ce que le diff promet — et qui, faux, produirait une trace **crédible et
 * mensongère** : le pire état pour un journal, parce qu'on le croit.
 */
describe("changesBetween", () => {
  it("ne rend RIEN quand rien n'a bougé", () => {
    // Un objet vide dit à l'appelant de n'écrire aucun fait : enregistrer une
    // section sans la modifier ne doit pas remplir l'historique.
    expect(changesBetween({ a: 1, b: "x" }, { a: 1, b: "x" })).toEqual({});
  });

  it("rend l'avant ET l'après du seul champ qui bouge", () => {
    expect(changesBetween({ prix: 240, poids: 80 }, { prix: 260, poids: 80 })).toEqual({
      prix: { from: 240, to: 260 },
    });
  });

  it("distingue « vidé » de « inchangé »", () => {
    // `null` est une décision — « ce produit n'a plus de poids déclaré ».
    expect(changesBetween({ poids: 80 }, { poids: null })).toEqual({
      poids: { from: 80, to: null },
    });
  });

  it("compare les textes localisés en PROFONDEUR", () => {
    // Deux cartes distinctes portant les mêmes langues sont égales ; sinon
    // chaque enregistrement produirait un faux changement de nom.
    expect(changesBetween({ nom: { fr: "Pain" } }, { nom: { fr: "Pain" } })).toEqual({});
    expect(changesBetween({ nom: { fr: "Pain" } }, { nom: { fr: "Pain", en: "Bread" } })).toEqual({
      nom: { from: { fr: "Pain" }, to: { fr: "Pain", en: "Bread" } },
    });
  });

  it("compare les listes par leur ORDRE", () => {
    // Réordonner des visuels EST une modification — c'est ce que l'écran a fait.
    expect(changesBetween({ codes: ["AM", "AE"] }, { codes: ["AM", "AE"] })).toEqual({});
    expect(changesBetween({ codes: ["AM", "AE"] }, { codes: ["AE", "AM"] })).toEqual({
      codes: { from: ["AM", "AE"], to: ["AE", "AM"] },
    });
  });

  it("ABRÈGE les longs textes, sans perdre le fait", () => {
    const long = "x".repeat(400);
    const changes = changesBetween({ histoire: "" }, { histoire: long });

    expect(changes["histoire"]?.to).toBe(`${"x".repeat(120)}…`);
  });

  it("abrège aussi DANS les textes localisés", () => {
    const long = "y".repeat(400);
    const changes = changesBetween({ texte: { fr: "" } }, { texte: { fr: long } });

    expect(changes["texte"]?.to).toEqual({ fr: `${"y".repeat(120)}…` });
  });
});

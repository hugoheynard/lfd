import { PLAQUETTE_HIVER_2026, type LignePlaquette } from "../plaquette-hiver-2026.js";
import { lignesInversees, normaliser, rapprocher, type ArticleCatalogue } from "../matching.js";

function ligne(nom: string, proHtMillicents = 150_000, publicTtcCents = 200): LignePlaquette {
  return { nom, famille: "viennoiseries", proHtMillicents, publicTtcCents };
}

function article(sku: string, nom: string, pimPriceMillicents = 190_000): ArticleCatalogue {
  return { sku, nom, pimPriceMillicents };
}

describe("normaliser un libellé", () => {
  /**
   * La plaquette est composée en capitales sans accents, le référentiel en
   * casse normale et accentué. Sans cette réduction, aucune ligne ne
   * s'apparierait — et l'import rendrait « 89 introuvables ».
   */
  it("efface la casse et les accents", () => {
    expect(normaliser("SABLE SUISSE")).toBe(normaliser("Sablé suisse"));
    expect(normaliser("PATE A TARTINER")).toBe(normaliser("Pâte à tartiner"));
  });

  /** La plaquette emploie l'apostrophe typographique, le référentiel la droite. */
  it("réconcilie les deux apostrophes", () => {
    expect(normaliser("PATTE D’OURS")).toBe(normaliser("Patte d'ours"));
  });

  it("ramène les espaces multiples à un seul", () => {
    expect(normaliser("CROIX   DE  SAVOIE")).toBe("croix de savoie");
  });

  /**
   * 🔴 Les chiffres RESTENT. « Baguette artisane 200 g » et « Baguette artisane
   * 400 g » sont deux articles à deux prix ; les confondre facturerait l'un au
   * tarif de l'autre.
   */
  it("garde les chiffres et les unités, qui distinguent deux articles", () => {
    expect(normaliser("BAGUETTE ARTISANE 200 G")).not.toBe(normaliser("BAGUETTE ARTISANE 400 G"));
  });
});

describe("rapprocher la plaquette du catalogue", () => {
  it("apparie une ligne au seul article qui porte son nom", () => {
    const { apparies, refuses } = rapprocher(
      [ligne("CROISSANT")],
      [article("VIE-001-1", "Croissant"), article("VIE-002-1", "Pain au lait")],
    );

    expect(refuses).toEqual([]);
    expect(apparies[0]?.article.sku).toBe("VIE-001-1");
  });

  /**
   * 🔴 Le cas qui justifie tout le reste : deux articles au même nom ont deux
   * SKU, donc deux prix possibles. En prendre un au hasard facturerait un
   * client sur une décision que personne n'a prise.
   */
  it("REFUSE plutôt que de choisir entre deux homonymes", () => {
    const { apparies, refuses } = rapprocher(
      [ligne("CROISSANT")],
      [article("VIE-001-1", "Croissant"), article("VIE-009-1", "croissant")],
    );

    expect(apparies).toEqual([]);
    expect(refuses[0]?.motif).toBe("ambigu");
    expect(refuses[0]?.candidats).toEqual(["VIE-001-1", "VIE-009-1"]);
  });

  it("dit introuvable ce que le catalogue ne porte pas", () => {
    const { refuses } = rapprocher([ligne("TARTE AUX FRAISES")], [article("A", "Croissant")]);

    expect(refuses[0]?.motif).toBe("introuvable");
  });

  /**
   * Un prix imprimé qui coïncide avec celui du référentiel n'est pas une
   * décision : poser une décision locale identique serait une décision vide, et
   * l'agrégat la refuse (`RedundantB2bPriceError`).
   */
  it("signale la ligne déjà au prix du référentiel", () => {
    const { apparies } = rapprocher(
      [ligne("CROISSANT", 150_000)],
      [article("VIE-001-1", "Croissant", 150_000)],
    );

    expect(apparies[0]?.dejaAuPrixPim).toBe(true);
  });

  /**
   * Les articles qu'aucune ligne ne nomme gardent le prix du référentiel. Les
   * compter est la moitié du compte rendu : « 89 écrits » ne dit rien tant
   * qu'on ne sait pas combien d'articles restent hors grille.
   */
  it("rend les articles qu'aucune ligne ne cite", () => {
    const { nonCites } = rapprocher(
      [ligne("CROISSANT")],
      [article("VIE-001-1", "Croissant"), article("PAI-004-1", "Baguette tradition")],
    );

    expect(nonCites.map((a) => a.sku)).toEqual(["PAI-004-1"]);
  });
});

describe("les lignes inversées de la plaquette", () => {
  /**
   * 🔴 Le professionnel y paie hors taxe plus cher que le particulier toutes
   * taxes comprises. Elles sont importées quand même — la plaquette est
   * l'engagement — mais nommées, pour que personne ne découvre l'anomalie par
   * une réclamation.
   */
  it("en compte huit dans la plaquette Hiver 2026", () => {
    expect(lignesInversees(PLAQUETTE_HIVER_2026)).toHaveLength(8);
  });

  it("compare bien des millicentimes à des centimes", () => {
    // 1,50 € HT contre 2,00 € TTC : normal, et non inversé.
    expect(lignesInversees([ligne("CROISSANT", 150_000, 200)])).toEqual([]);
    // 7,10 € HT contre 6,50 € TTC : inversé.
    expect(lignesInversees([ligne("CROQUE", 710_000, 650)])).toHaveLength(1);
  });
});

describe("la plaquette elle-même", () => {
  it("porte les 89 lignes relevées", () => {
    expect(PLAQUETTE_HIVER_2026).toHaveLength(89);
  });

  /** Un doublon ferait écrire deux prix sur le même article, dans un ordre non décidé. */
  it("ne nomme jamais deux fois le même article", () => {
    const noms = PLAQUETTE_HIVER_2026.map((l) => normaliser(l.nom));

    expect(new Set(noms).size).toBe(noms.length);
  });

  it("ne porte que des prix strictement positifs", () => {
    expect(PLAQUETTE_HIVER_2026.filter((l) => l.proHtMillicents <= 0)).toEqual([]);
  });
});

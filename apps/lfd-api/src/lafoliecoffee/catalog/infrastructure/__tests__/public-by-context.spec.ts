import { publicByContextOf } from "../public-by-context.js";

/**
 * **Relire une colonne `jsonb`, c'est faire confiance à ce qu'on a écrit il y a
 * six mois** — sous une version du fil qui n'existe peut-être plus. D'où une
 * vérification, et d'où ces tests : ils portent sur le REFUS, pas sur le cas
 * qui marche.
 */
describe("le prix public par contexte, relu du stockage", () => {
  const ONE = { takeaway: { vatRatePercent: 5.5, htMillicents: 189_573 } };

  it("relit une carte bien formée, telle quelle", () => {
    expect(publicByContextOf(ONE)).toEqual(ONE);
  });

  /**
   * 🔴 L'état des lignes d'avant la v9, et il se lit « on ne sait pas ce qu'un
   * particulier paierait ». Surtout pas « gratuit » : c'est la faute que le
   * fil refuse déjà en rendant `priceMillicents` obligatoire.
   */
  it("rend `null` quand la colonne est vide — et JAMAIS une carte vide", () => {
    expect(publicByContextOf(null)).toBeNull();
    expect(publicByContextOf(undefined)).toBeNull();
  });

  it("refuse ce qui n'est pas un objet — un tableau n'est pas une carte", () => {
    expect(publicByContextOf([])).toBeNull();
    expect(publicByContextOf("takeaway")).toBeNull();
    expect(publicByContextOf(42)).toBeNull();
  });

  /**
   * 🔴 **Une entrée fautive n'emporte pas les autres.** Rejeter la carte
   * entière ferait perdre trois contextes justes à cause d'un quatrième ; et un
   * article privé de son prix public se comporte comme un article d'avant la
   * v9, ce qui est le repli sûr.
   */
  it("écarte l'entrée mal formée et garde les bonnes", () => {
    expect(
      publicByContextOf({
        ...ONE,
        eatIn: { vatRatePercent: 10 },
        b2b: "5.5",
        surPlace: null,
      }),
    ).toEqual(ONE);
  });

  /**
   * Les deux vont ENSEMBLE : un hors taxe sans son taux ne se facture pas, et
   * un taux sans son montant n'est pas un prix. On ne garde donc jamais la
   * moitié d'une entrée.
   */
  it("n'accepte jamais la moitié d'une entrée", () => {
    expect(publicByContextOf({ takeaway: { htMillicents: 189_573 } })).toEqual({});
    expect(publicByContextOf({ takeaway: { vatRatePercent: 5.5 } })).toEqual({});
  });

  /** Un hors taxe est un ENTIER de millicentimes, et un taux n'est pas négatif. */
  it("refuse un montant à virgule et les valeurs négatives", () => {
    expect(publicByContextOf({ takeaway: { vatRatePercent: 5.5, htMillicents: 1.5 } })).toEqual({});
    expect(publicByContextOf({ takeaway: { vatRatePercent: -1, htMillicents: 100 } })).toEqual({});
    expect(publicByContextOf({ takeaway: { vatRatePercent: 5.5, htMillicents: -1 } })).toEqual({});
  });

  /** Une carte vide est une réponse : « aucun contexte réglé ». Elle n'est pas `null`. */
  it("distingue une carte VIDE d'une colonne absente", () => {
    expect(publicByContextOf({})).toEqual({});
    expect(publicByContextOf({})).not.toBeNull();
  });
});

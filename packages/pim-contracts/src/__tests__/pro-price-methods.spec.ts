import {
  proPriceFromPublic,
  proPriceOf,
  realDiscountBp,
  type ProPricePolicy,
} from "../accounting-rules.js";

/** Dix euros TTC public, remise nominale de 10 %. */
const TEN_EUROS = 1000;
const RATIO_90 = 9_000;

const RATIO_TTC: ProPricePolicy = {
  method: "ratio_ttc",
  ratioBp: RATIO_90,
  fixedVatPercent: null,
};

/** La plaquette : calculée à 20 %, quel que soit le taux réel de l'article. */
const BROCHURE: ProPricePolicy = {
  method: "remise_apres_tva_max",
  ratioBp: RATIO_90,
  fixedVatPercent: 20,
};

describe("la méthode d’origine — ratio TTC pré-remise", () => {
  it("remise le TTC public, puis déduit le HT du taux de l’article", () => {
    const price = proPriceOf(TEN_EUROS, RATIO_TTC, 5.5);

    expect(price?.ttcCents).toBe(900);
    // 900 c ÷ 1,055 = 853,081 c, en millicentimes (1 000 par centime).
    expect(price?.htMillicents).toBe(853_081);
  });

  it("rend exactement ce que `proPriceFromPublic` rendait", () => {
    expect(proPriceOf(TEN_EUROS, RATIO_TTC, 20)?.ttcCents).toBe(
      proPriceFromPublic(TEN_EUROS, RATIO_90),
    );
  });
});

describe("la méthode de la plaquette — remise après TVA max", () => {
  /**
   * 🔴 Le chiffre qui a fait basculer la conception : 750 c, contre 853 c par la
   * méthode d'origine. La plaquette est **moins chère**, pas plus — retirer
   * *plus* de TVA laisse une assiette *plus petite*. Le premier plan affirmait
   * l'inverse.
   */
  it("dépouille au taux FIGÉ, pas au taux de l’article", () => {
    const price = proPriceOf(TEN_EUROS, BROCHURE, 5.5);

    // 1000 ÷ 1,20 = 833,333 c, × 0,9 = 750 c.
    expect(price?.htMillicents).toBe(750_000);
    // Retaxé au taux RÉEL : 750 × 1,055 = 791,25 → 791 c.
    expect(price?.ttcCents).toBe(791);
  });

  /**
   * L'égalité qui dit ce qu'est vraiment cette méthode : la même remise, dont
   * le hors taxe est dérivé au taux figé au lieu du taux de l'article.
   * `B_ht ≡ A_ttc ÷ 1,20`.
   */
  it("vaut le TTC de l’autre méthode divisé par le taux figé", () => {
    const brochureHt = proPriceOf(TEN_EUROS, BROCHURE, 5.5)?.htMillicents;
    const ratioTtc = proPriceOf(TEN_EUROS, RATIO_TTC, 5.5)?.ttcCents ?? 0;

    // 900 c ÷ 1,20 = 750 c, soit 750 000 millicentimes.
    expect(brochureHt).toBe(Math.round((ratioTtc / 1.2) * 1_000));
  });

  /** Sur un article déjà à 20 %, les deux méthodes coïncident : rien à dépouiller de plus. */
  it("rejoint la méthode d’origine quand l’article EST au taux figé", () => {
    expect(proPriceOf(TEN_EUROS, BROCHURE, 20)?.htMillicents).toBe(
      proPriceOf(TEN_EUROS, RATIO_TTC, 20)?.htMillicents,
    );
  });

  /**
   * Une méthode qui prétend retirer une TVA sans savoir laquelle ne doit rien
   * produire — surtout pas le prix public intact, qui passerait pour un tarif.
   */
  it("ne produit rien sans son taux figé", () => {
    expect(proPriceOf(TEN_EUROS, { ...BROCHURE, fixedVatPercent: null }, 5.5)).toBeNull();
  });
});

describe("le taux de l’article reste exigé par les DEUX méthodes", () => {
  /**
   * Sous la plaquette, le hors taxe ne dépend plus du taux de l'article — mais
   * il sert toujours à FACTURER. L'article sans taux reste donc écarté du
   * canal (`variant_sans_taux`), pour la raison inchangée : inventer un taux
   * facturerait un montant que personne n'a décidé.
   */
  it("refuse un article sans taux, plaquette comprise", () => {
    expect(proPriceOf(TEN_EUROS, RATIO_TTC, null)).toBeNull();
    expect(proPriceOf(TEN_EUROS, BROCHURE, null)).toBeNull();
  });
});

describe("la remise RÉELLE, celle que la plaquette ignore", () => {
  it("colle à la remise nominale sous la méthode d’origine", () => {
    const pro = proPriceOf(TEN_EUROS, RATIO_TTC, 5.5)?.ttcCents ?? 0;

    expect(realDiscountBp(TEN_EUROS, pro)).toBe(1_000);
  });

  /** 10 % annoncés, ~21 % consentis sur un article à 5,5 %. C'est l'écart à montrer. */
  it("explose sous la plaquette dès que l’article est sous le taux figé", () => {
    const pro = proPriceOf(TEN_EUROS, BROCHURE, 5.5)?.ttcCents ?? 0;

    expect(realDiscountBp(TEN_EUROS, pro)).toBe(2_090);
  });

  it("ne s’exprime pas sur un prix public nul", () => {
    expect(realDiscountBp(0, 0)).toBeNull();
  });
});

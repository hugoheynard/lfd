import { InvalidSirenError, SirenSiretMismatchError } from "../../errors/account-errors.js";
import { Company, type CompanyIdentityInput } from "../company.js";

/** SIRET dont le préfixe `812456788` est un SIREN valide. */
const SIRET = "81245678800023";
const SIREN = "812456788";
/** Un autre établissement de la même entreprise. */
const SIRET_SAME_COMPANY = "81245678800031";
/** Un établissement d'une autre entreprise, au préfixe valide. */
const OTHER_SIRET = "73282932000074";
const OTHER_SIREN = "732829320";
/** SIRET valide dont le préfixe `812456789` n'est PAS un SIREN valide. */
const SIRET_INVALID_PREFIX = "81245678900021";

const bare: CompanyIdentityInput = {
  raisonSociale: "",
  enseigne: "Le Comptoir",
  formeJuridique: "",
  siret: "",
  siren: "",
  vatNumber: "",
};

function declared(identity: Partial<CompanyIdentityInput> = {}): Company {
  return Company.declare({ ...bare, ...identity }, null);
}

const NOTHING = { raisonSociale: "", formeJuridique: "", siret: "", siren: "" };

function stored(siret: string, siren: string | undefined): Company {
  return Company.reconstitute({
    id: "c1",
    raisonSociale: "PQ Marais",
    enseigne: "Marais Café",
    formeJuridique: "SAS",
    siret,
    ...(siren === undefined ? {} : { siren }),
    vatNumber: "",
    contact: null,
    grantedTerms: [],
    requestedTerm: null,
    status: "pending",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
  });
}

describe("Company — SIREN à la déclaration", () => {
  it("pose le SIREN depuis un SIRET au préfixe valide", () => {
    const company = declared({ siret: "812 456 788 00023" });

    expect(company.sirenDigits).toBe(SIREN);
    expect(company.toPersistence()).toMatchObject({ siret: SIRET, siren: SIREN });
  });

  /**
   * Régression : `81245678900021` passe la clé du SIRET, pas celle du SIREN.
   * En déduire `812456789` écrivait un SIREN que le domaine refuse ensuite.
   */
  it("laisse le SIREN vide quand le préfixe du SIRET n'est pas un SIREN valide", () => {
    const company = declared({ siret: SIRET_INVALID_PREFIX });

    expect(company.siren).toBeNull();
    expect(company.toPersistence().siren).toBe("");
  });

  it("accepte un SIREN libre à côté d'un SIRET au préfixe invalide", () => {
    expect(declared({ siret: SIRET_INVALID_PREFIX, siren: OTHER_SIREN }).sirenDigits).toBe(
      OTHER_SIREN,
    );
  });

  it("accepte un SIREN seul, sans SIRET", () => {
    const company = declared({ siren: "732 829 320" });

    expect(company.siret).toBeNull();
    expect(company.sirenDigits).toBe(OTHER_SIREN);
  });

  it("accepte un SIREN saisi qui EST le préfixe du SIRET", () => {
    expect(declared({ siret: SIRET, siren: "812 456 788" }).sirenDigits).toBe(SIREN);
  });

  it("refuse une paire qui se contredit, en nommant les deux valeurs", () => {
    expect(() => declared({ siret: SIRET, siren: OTHER_SIREN })).toThrow(SirenSiretMismatchError);
    expect(() => declared({ siret: SIRET, siren: OTHER_SIREN })).toThrow(
      new RegExp(`${OTHER_SIREN}.*${SIRET}`, "u"),
    );
  });

  it("refuse un SIREN mal formé", () => {
    expect(() => declared({ siren: "812456789" })).toThrow(InvalidSirenError);
  });
});

describe("Company.completeLegalIdentity — SIREN", () => {
  it("pose le SIREN quand le client saisit enfin le SIRET", () => {
    const company = declared();

    company.completeLegalIdentity({ ...NOTHING, siret: SIRET });

    expect(company.sirenDigits).toBe(SIREN);
  });

  it("un SIREN vide n'efface pas le SIREN déjà posé", () => {
    const company = declared({ siren: OTHER_SIREN });

    company.completeLegalIdentity({ ...NOTHING, raisonSociale: "Comptoir SAS" });

    expect(company.sirenDigits).toBe(OTHER_SIREN);
    expect(company.raisonSociale).toBe("Comptoir SAS");
  });

  it("ne réécrit pas un SIREN posé — le client complète, il ne corrige pas", () => {
    const company = declared({ siren: OTHER_SIREN });

    company.completeLegalIdentity({ ...NOTHING, siren: SIREN });

    expect(company.sirenDigits).toBe(OTHER_SIREN);
  });

  it("refuse un SIRET qui contredit le SIREN déjà posé, sans rien écrire", () => {
    const company = declared({ siren: OTHER_SIREN });

    expect(() => {
      company.completeLegalIdentity({ ...NOTHING, raisonSociale: "Comptoir SAS", siret: SIRET });
    }).toThrow(SirenSiretMismatchError);
    expect(company.siret).toBeNull();
    expect(company.raisonSociale).toBe("");
  });

  it("ne lève pas sur une paire ancienne contradictoire qu'on ne touche pas", () => {
    const company = stored(SIRET, OTHER_SIREN);

    company.completeLegalIdentity({ ...NOTHING, siren: SIREN });

    expect(company.toPersistence()).toMatchObject({ siret: SIRET, siren: OTHER_SIREN });
  });
});

describe("Company.correctLegalIdentity — SIREN", () => {
  it("un SIRET envoyé sans SIREN recalcule le SIREN", () => {
    const company = stored(SIRET, SIREN);

    company.correctLegalIdentity({ ...NOTHING, siret: OTHER_SIRET });

    expect(company.toPersistence()).toMatchObject({ siret: OTHER_SIRET, siren: OTHER_SIREN });
  });

  it("des champs vides ne réécrivent rien", () => {
    const company = stored(SIRET, SIREN);

    company.correctLegalIdentity({ ...NOTHING, formeJuridique: "SARL" });

    expect(company.toPersistence()).toMatchObject({
      siret: SIRET,
      siren: SIREN,
      formeJuridique: "SARL",
    });
  });

  it("vers un préfixe invalide, efface le SIREN qui venait de l'ancien SIRET", () => {
    const company = stored(SIRET, SIREN);

    company.correctLegalIdentity({ ...NOTHING, siret: SIRET_INVALID_PREFIX });

    expect(company.siren).toBeNull();
  });

  it("vers un préfixe invalide, garde un SIREN qui avait été saisi", () => {
    const company = stored(SIRET_INVALID_PREFIX, OTHER_SIREN);

    company.correctLegalIdentity({ ...NOTHING, siret: "81245678900039" });

    expect(company.sirenDigits).toBe(OTHER_SIREN);
  });

  it("corrige le SIREN seul quand le SIRET ne le fixe pas", () => {
    const company = stored(SIRET_INVALID_PREFIX, OTHER_SIREN);

    company.correctLegalIdentity({ ...NOTHING, siren: SIREN });

    expect(company.sirenDigits).toBe(SIREN);
  });

  it("refuse un SIREN qui contredit le SIRET en place", () => {
    const company = stored(SIRET, SIREN);

    expect(() => {
      company.correctLegalIdentity({ ...NOTHING, siren: OTHER_SIREN });
    }).toThrow(SirenSiretMismatchError);
    expect(company.sirenDigits).toBe(SIREN);
  });

  it("accepte SIRET et SIREN corrigés ensemble quand ils concordent", () => {
    const company = stored(SIRET, SIREN);

    company.correctLegalIdentity({ ...NOTHING, siret: SIRET_SAME_COMPANY, siren: SIREN });

    expect(company.toPersistence()).toMatchObject({ siret: SIRET_SAME_COMPANY, siren: SIREN });
  });
});

describe("Company.reconstitute — SIREN", () => {
  it("complète un SIREN vide depuis un préfixe valide", () => {
    expect(stored(SIRET, "").sirenDigits).toBe(SIREN);
    expect(stored(SIRET, undefined).sirenDigits).toBe(SIREN);
  });

  it("laisse vide un SIREN absent quand le préfixe est invalide", () => {
    expect(stored(SIRET_INVALID_PREFIX, "").siren).toBeNull();
  });

  it("ne lève jamais pour une paire contradictoire, et la garde telle quelle", () => {
    expect(stored(SIRET, OTHER_SIREN).toPersistence()).toMatchObject({
      siret: SIRET,
      siren: OTHER_SIREN,
    });
  });
});

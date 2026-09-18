import {
  EMAIL_CLAIM,
  EMAIL_VERIFIED_CLAIM,
  isOutsideDatabaseConnection,
  readBooleanClaim,
  readStringClaim,
} from "../auth0-claims.js";

/**
 * Ces noms de claims sont la moitié d'un contrat dont **l'autre moitié vit hors
 * du dépôt** : une Action, dans le dashboard Auth0. Aucun test d'intégration ne
 * peut les rapprocher, et un désaccord ne lève rien — le claim arrive
 * simplement `undefined`, et la personne prend un `403` qu'elle ne comprend pas.
 *
 * D'où ce test, qui ressemble à une tautologie et n'en est pas une : il rend le
 * changement **bruyant**. Qui touche au namespace casse ce test, lit pourquoi,
 * et va mettre l'Action à jour. C'est la seule alerte possible ici.
 */
describe("claims Auth0 — l'accord avec le tenant", () => {
  it("porte exactement les noms que l'Action `add-email-claim` pose", () => {
    // ⚠️ Changer ces chaînes SANS redéployer l'Action casse la connexion staff
    // ET le rapprochement client. Voir le JSDoc de `auth0-claims.ts`.
    expect(EMAIL_CLAIM).toBe("https://lafoliedouce.eu/email");
    expect(EMAIL_VERIFIED_CLAIM).toBe("https://lafoliedouce.eu/email_verified");
  });

  it("sont namespacés — un claim nu serait retiré par Auth0", () => {
    // La panne d'origine : le verifier staff lisait `email`, qu'Auth0 strippe
    // en silence des access tokens. Le préfixe n'est pas cosmétique.
    for (const claim of [EMAIL_CLAIM, EMAIL_VERIFIED_CLAIM]) {
      expect(claim.startsWith("https://")).toBe(true);
    }
  });
});

describe("readStringClaim", () => {
  it("rend la valeur quand le claim est une chaîne non vide", () => {
    expect(readStringClaim({ [EMAIL_CLAIM]: "sophie@lfc.test" }, EMAIL_CLAIM)).toBe(
      "sophie@lfc.test",
    );
  });

  it("traite la chaîne vide comme une absence", () => {
    // Un e-mail vide rapprocherait la personne de la première fiche vide venue.
    expect(readStringClaim({ [EMAIL_CLAIM]: "" }, EMAIL_CLAIM)).toBeUndefined();
  });

  it("ignore un claim d'un autre type plutôt que de le coercer", () => {
    expect(readStringClaim({ [EMAIL_CLAIM]: 42 }, EMAIL_CLAIM)).toBeUndefined();
    expect(readStringClaim({ [EMAIL_CLAIM]: null }, EMAIL_CLAIM)).toBeUndefined();
  });

  it("rend `undefined` quand le claim est absent", () => {
    expect(readStringClaim({}, EMAIL_CLAIM)).toBeUndefined();
  });
});

describe("readBooleanClaim", () => {
  it("rend le booléen tel quel, `false` compris", () => {
    expect(readBooleanClaim({ [EMAIL_VERIFIED_CLAIM]: true }, EMAIL_VERIFIED_CLAIM)).toBe(true);
    expect(readBooleanClaim({ [EMAIL_VERIFIED_CLAIM]: false }, EMAIL_VERIFIED_CLAIM)).toBe(false);
  });

  it('ne coerce pas une chaîne `"true"` en preuve', () => {
    // Une adresse « vérifiée » par erreur de type ouvrirait le rapprochement staff.
    expect(
      readBooleanClaim({ [EMAIL_VERIFIED_CLAIM]: "true" }, EMAIL_VERIFIED_CLAIM),
    ).toBeUndefined();
    expect(readBooleanClaim({}, EMAIL_VERIFIED_CLAIM)).toBeUndefined();
  });
});

describe("isOutsideDatabaseConnection", () => {
  it("refuse Google et Facebook", () => {
    expect(isOutsideDatabaseConnection("google-oauth2|104233")).toBe(true);
    expect(isOutsideDatabaseConnection("facebook|10158")).toBe(true);
  });

  it("admet la connexion base de données", () => {
    expect(isOutsideDatabaseConnection("auth0|64f1c2")).toBe(false);
  });

  it("refuse aussi le sans-mot-de-passe et les sujets de développement", () => {
    expect(isOutsideDatabaseConnection("email|66a1")).toBe(true);
    expect(isOutsideDatabaseConnection("dev-staff|sophie@lfc.test")).toBe(true);
  });

  it("laisse à l'annuaire un sujet sans fournisseur (bypass, doubles, machine)", () => {
    expect(isOutsideDatabaseConnection("dev-staff")).toBe(false);
    expect(isOutsideDatabaseConnection("|orphelin")).toBe(false);
  });
});

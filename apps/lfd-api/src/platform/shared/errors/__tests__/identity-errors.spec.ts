import { IdentitySubjectUnknownError } from "../identity-errors.js";

/**
 * Régression : le message portait le `sub` Auth0, et `AppErrorFilter` écrit le
 * message d'une erreur technique au journal de production — un identifiant
 * chez un tiers finissait dans nos logs (plan `plan-l-auteur-est-la-fiche.md`,
 * §8, 2026-09-18).
 */
describe("IdentitySubjectUnknownError", () => {
  it("ne met pas le `sub` dans son message, et le garde pour l'appelant qui répare", () => {
    const error = new IdentitySubjectUnknownError("auth0|64f0c0ffee");

    expect(error.message).not.toContain("auth0|64f0c0ffee");
    expect(error.subject).toBe("auth0|64f0c0ffee");
    expect(error.code).toBe("identity_provider.subject_unknown");
  });
});

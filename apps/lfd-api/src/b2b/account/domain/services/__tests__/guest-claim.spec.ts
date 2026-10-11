import { GUEST_CLAIM_ROUTES, mayClaimGuestFile, soleGuestFile } from "../guest-claim.js";

/** Une première entrée par code, adresse prouvée : le cas qui rattache. */
const BY_CODE = { subject: "email|6ac8", email: "lea@exemple.fr", addressProven: true };

/**
 * R1 du plan bienvenue (2026-10-11) : prendre possession d'une fiche invité
 * par son adresse est une frontière de sécurité. Chaque condition se refuse
 * seule.
 */
describe("mayClaimGuestFile", () => {
  it("admet la connexion par code e-mail, adresse prouvée", () => {
    expect(mayClaimGuestFile(BY_CODE)).toBe(true);
  });

  it("admet Google, adresse prouvée", () => {
    expect(mayClaimGuestFile({ ...BY_CODE, subject: "google-oauth2|1094" })).toBe(true);
  });

  it("🔴 refuse le mot de passe, même adresse prouvée", () => {
    expect(mayClaimGuestFile({ ...BY_CODE, subject: "auth0|66a1" })).toBe(false);
  });

  it("🔴 refuse Facebook, même adresse prouvée", () => {
    expect(mayClaimGuestFile({ ...BY_CODE, subject: "facebook|1234" })).toBe(false);
  });

  it.each(["samlp|acme|x", "sms|+33600000000", "dev|lea", "sans-barre", "|email"])(
    "refuse une connexion hors liste (%s)",
    (subject) => {
      expect(mayClaimGuestFile({ ...BY_CODE, subject })).toBe(false);
    },
  );

  it("🔴 refuse une adresse que le jeton ne prouve pas", () => {
    expect(mayClaimGuestFile({ ...BY_CODE, addressProven: false })).toBe(false);
  });

  it.each(["", "   "])("refuse une adresse vide (%j)", (email) => {
    expect(mayClaimGuestFile({ ...BY_CODE, email })).toBe(false);
  });

  it("ne connaît que deux connexions admises", () => {
    expect([...GUEST_CLAIM_ROUTES].sort()).toEqual(["email_code", "google"]);
  });
});

describe("soleGuestFile", () => {
  it("désigne l'unique fiche", () => {
    expect(soleGuestFile(["g1"])).toBe("g1");
  });

  it("ne désigne rien sans fiche", () => {
    expect(soleGuestFile([])).toBeNull();
  });

  it("🔴 ne désigne rien quand deux fiches portent l'adresse (R5 : compte neuf)", () => {
    expect(soleGuestFile(["g1", "g2"])).toBeNull();
  });
});

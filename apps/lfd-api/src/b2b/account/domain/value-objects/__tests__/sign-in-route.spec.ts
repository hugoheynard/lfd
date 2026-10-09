import { signInRouteOfProvider, signInRouteOfSubject } from "../sign-in-route.js";

describe("SignInRoute", () => {
  it.each([
    ["auth0|abc", "password"],
    ["email|abc", "email_code"],
    ["google-oauth2|123", "google"],
    ["facebook|9", "facebook"],
    ["apple|1", "other"],
    ["sans-barre", "other"],
    ["|vide", "other"],
  ])("le sujet %s se connecte par %s", (subject, route) => {
    expect(signInRouteOfSubject(subject)).toBe(route);
  });

  /** Un nom hérité d'`Object.prototype` n'est pas un fournisseur. */
  it("ne prend pas `constructor` pour un fournisseur", () => {
    expect(signInRouteOfProvider("constructor")).toBe("other");
  });
});

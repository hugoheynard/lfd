import { LoginMethodNotLinkableError } from "../../errors/account-errors.js";
import { LinkableIdentity } from "../linkable-identity.js";

describe("LinkableIdentity", () => {
  it("découpe un sujet Google au premier `|`", () => {
    const identity = LinkableIdentity.of("google-oauth2|104319369679059688542");

    expect([identity.provider, identity.userId]).toEqual([
      "google-oauth2",
      "104319369679059688542",
    ]);
  });

  it("garde les `|` suivants dans l'identifiant", () => {
    expect(LinkableIdentity.of("facebook|a|b").userId).toBe("a|b");
  });

  /**
   * 🔴 Le mur (2026-10-09) : `auth0|…` peut être un compte du staff, et
   * l'absorber le priverait du back-office.
   */
  it.each([
    "auth0|6a738c78c56af8b59b0fd2c5",
    "email|6ac8a7c2c415ff96d906df03",
    "sans-barre",
    "google-oauth2|",
    "|123",
  ])("refuse « %s »", (subject) => {
    expect(() => LinkableIdentity.of(subject)).toThrow(LoginMethodNotLinkableError);
  });
});

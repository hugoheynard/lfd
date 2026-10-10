import {
  ACCOUNT_LOGIN_METHOD_LINKED,
  LoginMethodLinkedFact,
  LoginMethodLinkedPayloadError,
} from "../login-method-linked.fact.js";

/**
 * Lot E5 (2026-10-10) : l'alerte de rattachement relit ce fait dans la boîte
 * d'envoi. Un payload hors forme est une faute d'émetteur.
 */
describe("LoginMethodLinkedFact — le fait durable", () => {
  it("porte une clé par geste, sans identité tierce, et se relit à l'identique", () => {
    const fact = new LoginMethodLinkedFact("usr_1", "google-oauth2", "lnk_1").durableFact();

    expect(fact).toEqual({
      type: ACCOUNT_LOGIN_METHOD_LINKED,
      key: "account.login_method_linked:usr_1:google-oauth2:lnk_1",
      payload: { userId: "usr_1", provider: "google-oauth2", linkId: "lnk_1" },
    });
    expect(LoginMethodLinkedFact.fromPayload(fact.payload)).toEqual(
      new LoginMethodLinkedFact("usr_1", "google-oauth2", "lnk_1"),
    );
  });

  it("un second rattachement du même fournisseur est un second fait", () => {
    const first = new LoginMethodLinkedFact("usr_1", "google-oauth2", "lnk_1").durableFact();
    const second = new LoginMethodLinkedFact("usr_1", "google-oauth2", "lnk_2").durableFact();

    expect(first.key).not.toBe(second.key);
  });

  it.each([
    [{ provider: "google-oauth2", linkId: "lnk_1" }],
    [{ userId: "", provider: "google-oauth2", linkId: "lnk_1" }],
    [{ userId: "usr_1", provider: 42, linkId: "lnk_1" }],
    [{ userId: "usr_1", provider: "google-oauth2" }],
  ])("refuse un payload hors forme %o", (payload) => {
    expect(() => LoginMethodLinkedFact.fromPayload(payload)).toThrow(LoginMethodLinkedPayloadError);
  });
});

import {
  missingManagementScopes,
  scopesFromAccessToken,
  REQUIRED_MANAGEMENT_SCOPES,
} from "../identity-diagnosis.js";

/** Fabrique un JWT de forme valide — seule la charge utile nous intéresse. */
function tokenWith(payload: Readonly<Record<string, unknown>>): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `header.${body}.signature`;
}

describe("scopesFromAccessToken", () => {
  it("lit les autorisations accordées", () => {
    const token = tokenWith({ scope: "read:users create:users" });

    expect(scopesFromAccessToken(token)).toEqual(["read:users", "create:users"]);
  });

  it("rend une liste vide quand le jeton ne porte aucune autorisation", () => {
    expect(scopesFromAccessToken(tokenWith({ sub: "machine@clients" }))).toEqual([]);
  });

  it("ne jette JAMAIS sur un jeton illisible — le pire cas doit rester bruyant", () => {
    // Un diagnostic qui explose ne diagnostique rien. Une liste vide se lira
    // « toutes les autorisations manquent » : faux négatif, jamais faux positif.
    expect(scopesFromAccessToken("pas-un-jwt")).toEqual([]);
    expect(scopesFromAccessToken("a.b.c")).toEqual([]);
    expect(scopesFromAccessToken(tokenWith({ scope: 42 }))).toEqual([]);
  });
});

describe("missingManagementScopes", () => {
  it("ne dit rien quand tout est accordé", () => {
    expect(missingManagementScopes(REQUIRED_MANAGEMENT_SCOPES)).toEqual([]);
  });

  it("nomme précisément ce qui manque", () => {
    const granted = ["read:users", "create:users", "update:users"];

    // Le cas qui nous a occupés : un compte peut naître, et personne ne peut y
    // entrer faute de lien de mot de passe.
    expect(missingManagementScopes(granted)).toEqual(["create:user_tickets"]);
  });

  it("ignore les autorisations en trop", () => {
    expect(missingManagementScopes([...REQUIRED_MANAGEMENT_SCOPES, "read:logs"])).toEqual([]);
  });
});

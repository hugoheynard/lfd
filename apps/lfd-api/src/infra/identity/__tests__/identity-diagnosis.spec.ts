import {
  isProviderSubject,
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

describe("isProviderSubject", () => {
  it("écarte un sujet fabriqué en développement", () => {
    // Le cas vécu : un `dev|…` en base de PRODUCTION. Envoyé à Auth0 il rend un
    // `400`, pas un `404` — la reprise ne partait donc jamais, et la personne
    // restait injoignable à chaque clic sur « ouvrir l'accès ».
    expect(isProviderSubject("dev|jean@exemple.fr")).toBe(false);
  });

  it("accepte les sujets du fournisseur, y compris une stratégie qu'on ne connaît pas", () => {
    // Une liste BLANCHE des stratégies Auth0 s'allongerait sans nous et
    // finirait par refuser un sujet parfaitement légitime.
    expect(isProviderSubject("auth0|6a7f2bafea6cc8fa4df5f4e5")).toBe(true);
    expect(isProviderSubject("google-oauth2|1234")).toBe(true);
    expect(isProviderSubject("waad|annuaire-dun-client")).toBe(true);
  });
});

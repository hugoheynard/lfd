import { AppConfig } from "../../config/app-config.js";
import {
  IdentityProviderScopeMissingError,
  IdentityProviderUnavailableError,
} from "../../shared/errors/identity-errors.js";
import { Auth0ManagementClient, insufficientScopes } from "../auth0-management.client.js";

/** Une config qui a des identifiants M2M, sans lire l'environnement. */
class ConfiguredAppConfig extends AppConfig {
  override auth0Domain(): string {
    return "tenant.test";
  }

  override auth0ManagementCredentials(): ReturnType<AppConfig["auth0ManagementCredentials"]> {
    return { clientId: "id", clientSecret: "secret" };
  }
}

const SCOPE_BODY = JSON.stringify({
  errorCode: "insufficient_scope",
  message: "Insufficient scope, expected any of: read:stats",
});

/**
 * Le réseau doublé à la main : le jeton est toujours accordé, la route rend la
 * réponse donnée. `fetch` est la seule frontière — on la remplace le temps d'un
 * test, et on la rend.
 */
function answering(status: number, body: string): typeof fetch {
  return (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/oauth/token")) {
      return Promise.resolve(
        new Response(JSON.stringify({ access_token: "jeton", expires_in: 86_400 }), {
          status: 200,
        }),
      );
    }
    return Promise.resolve(new Response(body, { status }));
  };
}

describe("Auth0ManagementClient — un refus de portée n'est pas une panne", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("403 insufficient_scope → IdentityProviderScopeMissingError qui nomme la portée", async () => {
    globalThis.fetch = answering(403, SCOPE_BODY);
    const client = new Auth0ManagementClient(new ConfiguredAppConfig());

    const refusal = await client.call("GET", "/api/v2/stats/active-users").catch((e: unknown) => e);

    expect(refusal).toBeInstanceOf(IdentityProviderScopeMissingError);
    expect(refusal).toMatchObject({ expectedScopes: ["read:stats"] });
    expect(refusal).toMatchObject({ message: expect.stringContaining("read:stats") as string });
    // Les autres appelants l'attrapent toujours comme une indisponibilité.
    expect(refusal).toBeInstanceOf(IdentityProviderUnavailableError);
  });

  it("403 d'une autre nature → indisponible, pas un refus de portée", async () => {
    globalThis.fetch = answering(403, JSON.stringify({ errorCode: "forbidden" }));
    const client = new Auth0ManagementClient(new ConfiguredAppConfig());

    const refusal = await client.call("GET", "/api/v2/users").catch((e: unknown) => e);

    expect(refusal).toBeInstanceOf(IdentityProviderUnavailableError);
    expect(refusal).not.toBeInstanceOf(IdentityProviderScopeMissingError);
  });
});

describe("insufficientScopes", () => {
  it("lit la liste des portées attendues", () => {
    expect(
      insufficientScopes(
        JSON.stringify({
          errorCode: "insufficient_scope",
          message: "Insufficient scope, expected any of: read:stats, read:users",
        }),
      ),
    ).toEqual(["read:stats", "read:users"]);
  });

  it("rend null pour un corps qui n'est pas un refus de portée", () => {
    expect(insufficientScopes("<html>")).toBeNull();
    expect(insufficientScopes(JSON.stringify({ errorCode: "x" }))).toBeNull();
  });
});

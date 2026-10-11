import { AppConfig } from "../../../platform/config/app-config.js";
import { Auth0ManagementClient } from "../../../platform/identity/auth0-management.client.js";
import { IdentityProviderScopeMissingError } from "../../../platform/shared/errors/identity-errors.js";
import { FixedClock } from "../../../platform/time/fixed-clock.js";
import { Auth0ReadingsReader, SCOPE_REFUSAL_MEMORY_MS } from "../auth0-readings.reader.js";

const ACTIVE = "/api/v2/stats/active-users";
const TENANT_TOTAL = 120;

/** Transport doublé : `stats` refusé faute de portée, le total du tenant répond. */
class ScopeRefusingClient extends Auth0ManagementClient {
  readonly paths: string[] = [];

  constructor() {
    super(new AppConfig());
  }

  override async call(_method: string, path: string): Promise<unknown> {
    this.paths.push(path);
    if (path === ACTIVE) {
      throw new IdentityProviderScopeMissingError(["read:stats"]);
    }
    return await Promise.resolve({ total: TENANT_TOTAL });
  }
}

describe("Auth0ReadingsReader — la portée read:stats manquante", () => {
  /**
   * Régression : l'écran OPS se rafraîchit toutes les 15 s, et chaque lecture
   * redemandait `stats/active-users` — un 403 identique, une ligne ERROR et une
   * pile DEBUG à chaque fois (constaté le 2026-10-11).
   */
  it("ne redemande pas stats/active-users à chaque rafraîchissement", async () => {
    const client = new ScopeRefusingClient();
    const reader = new Auth0ReadingsReader(client, new FixedClock(new Date()));

    await reader.read();
    await reader.read();

    expect(client.paths.filter((p) => p === ACTIVE)).toHaveLength(1);
  });

  it("affiche le total du tenant, en disant que le droit read:stats manque", async () => {
    const reader = new Auth0ReadingsReader(new ScopeRefusingClient(), new FixedClock(new Date()));

    const [shown] = await reader.read();

    expect(shown).toMatchObject({ label: "Identités", value: TENANT_TOTAL });
    expect(shown?.hint).toContain("droit read:stats manquant");
  });

  it("redemande une fois le délai de mémoire écoulé — la portée a pu être cochée", async () => {
    const client = new ScopeRefusingClient();
    const clock = new FixedClock(new Date());
    const reader = new Auth0ReadingsReader(client, clock);

    await reader.read();
    clock.advanceMs(SCOPE_REFUSAL_MEMORY_MS);
    await reader.read();

    expect(client.paths.filter((p) => p === ACTIVE)).toHaveLength(2);
  });
});

import type { OrderCompanyStatus } from "../../../domain/ports/company-status.reader.js";
import type { AccountSettlementStanding } from "../../../domain/ports/order-guard.reader.js";
import { accountStanding, settlingStatusOf, type SettlementPorts } from "../order-settlement.js";

type SettlementGuard = SettlementPorts["guard"];

/** Un garde à statuts par société, qui compte ses lectures de statut. */
class StatusGuard implements SettlementGuard {
  statusReads = 0;

  constructor(
    private readonly statuses: Readonly<Record<string, OrderCompanyStatus>>,
    private readonly standing: AccountSettlementStanding = "granted",
  ) {}

  companyStatusOf(companyId: string): Promise<OrderCompanyStatus | null> {
    this.statusReads += 1;
    return Promise.resolve(this.statuses[companyId] ?? null);
  }

  settlesOnAccount(): Promise<AccountSettlementStanding> {
    return Promise.resolve(this.standing);
  }
}

/**
 * Le compte se juge aussi au statut du PAYEUR (Hugo, 2026-11-03,
 * `documentation/comptes-client/plan-suspendue-au-prix-pro.md` § 5, décision 2).
 */
describe("accountStanding — le statut du payeur", () => {
  /** Régression : un site actif réglait au compte d'un principal suspendu. */
  it("ferme le compte d'un site actif dont le principal payeur est suspendu", async () => {
    const guard = new StatusGuard({ site: "active", head: "suspended" });
    expect(await accountStanding(guard, { companyId: "site", payerId: "head" })).toBe("none");
  });

  it("garde le compte d'un site dont le payeur est actif", async () => {
    const guard = new StatusGuard({ site: "active", head: "active" });
    expect(await accountStanding(guard, { companyId: "site", payerId: "head" })).toBe("granted");
  });

  it("ferme le compte d'une société suspendue qui paie seule", async () => {
    const guard = new StatusGuard({ co: "suspended" });
    expect(await accountStanding(guard, { companyId: "co", payerId: "co" })).toBe("none");
  });

  it("ne relit pas le statut d'une société qui paie seule", async () => {
    const guard = new StatusGuard({ co: "active" });
    expect(await accountStanding(guard, { companyId: "co", payerId: "co" })).toBe("granted");
    expect(guard.statusReads).toBe(1);
  });
});

describe("settlingStatusOf", () => {
  it("rend le statut de la société quand elle n'est pas active, sans lire le payeur", async () => {
    const guard = new StatusGuard({ head: "active" });
    expect(await settlingStatusOf(guard, "site", "head", "pending")).toBe("pending");
    expect(guard.statusReads).toBe(0);
  });

  it("rend le statut du payeur distinct d'une société active", async () => {
    const guard = new StatusGuard({ head: "suspended" });
    expect(await settlingStatusOf(guard, "site", "head", "active")).toBe("suspended");
  });

  it("rend le statut lu quand il n'y a pas de payeur", async () => {
    const guard = new StatusGuard({});
    expect(await settlingStatusOf(guard, "co", null, "active")).toBe("active");
    expect(guard.statusReads).toBe(0);
  });
});

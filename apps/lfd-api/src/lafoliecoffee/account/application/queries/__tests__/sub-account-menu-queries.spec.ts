import type { CompanyStanding } from "../../../../shared/company-standing/domain/company-standing.js";
import type { SubAccountMenuState } from "../../../domain/entities/sub-account-menu.js";
import { CompanyNotFoundError } from "../../../domain/errors/account-errors.js";
import { SubAccountMenuWriterRequiredError } from "../../../domain/errors/sub-account-menu-errors.js";
import { SubAccountMenuAccessReader } from "../../../domain/ports/sub-account-menu-access.reader.js";
import { SubAccountMenuReader } from "../../../domain/ports/sub-account-menu.reader.js";
import { GetSubAccountMenuForStaffHandler } from "../get-sub-account-menu-for-staff.handler.js";
import { GetSubAccountMenuForStaffQuery } from "../get-sub-account-menu-for-staff.query.js";
import { GetSubAccountMenuHandler } from "../get-sub-account-menu.handler.js";
import { GetSubAccountMenuQuery } from "../get-sub-account-menu.query.js";

const AT = new Date(Date.UTC(2030, 0, 1));

const STATE: SubAccountMenuState = {
  companyId: "co_site",
  mode: "only",
  offMenu: "hidden",
  entries: [{ id: "ent_1", level: "sku", ref: "CROI-1", effect: "include" }],
  stamp: { author: { kind: "customer", userId: "usr_1" }, at: AT },
};

class OneMenu extends SubAccountMenuReader {
  constructor(private readonly state: SubAccountMenuState | null) {
    super();
  }
  read(): Promise<SubAccountMenuState | null> {
    return Promise.resolve(this.state);
  }
}

class FixedStanding extends SubAccountMenuAccessReader {
  constructor(private readonly standing: CompanyStanding | null) {
    super();
  }
  standingOf(): Promise<CompanyStanding | null> {
    return Promise.resolve(this.standing);
  }
}

const HEIR: CompanyStanding = {
  companyStatus: "active",
  own: null,
  ownAccepted: false,
  via: { companyId: "co_principal", name: "Club", role: "admin" },
};
const SITE_OWNER: CompanyStanding = { ...HEIR, own: "owner", ownAccepted: true, via: null };

describe("GetSubAccountMenuHandler — la carte lue depuis le principal", () => {
  it("rend la carte à qui la règle, sans identifiant d'entrée", async () => {
    const view = await new GetSubAccountMenuHandler(
      new FixedStanding(HEIR),
      new OneMenu(STATE),
    ).execute(new GetSubAccountMenuQuery("usr_1", "co_site"));
    expect(view).toEqual({
      companyId: "co_site",
      menu: {
        mode: "only",
        offMenu: "hidden",
        entries: [{ level: "sku", ref: "CROI-1", effect: "include" }],
        updatedAt: AT.toISOString(),
        updatedBy: "principal",
      },
    });
  });

  it("refuse le propriétaire du site lui-même, et l'étranger comme une société inconnue", async () => {
    await expect(
      new GetSubAccountMenuHandler(new FixedStanding(SITE_OWNER), new OneMenu(STATE)).execute(
        new GetSubAccountMenuQuery("usr_1", "co_site"),
      ),
    ).rejects.toThrow(SubAccountMenuWriterRequiredError);
    await expect(
      new GetSubAccountMenuHandler(new FixedStanding(null), new OneMenu(STATE)).execute(
        new GetSubAccountMenuQuery("usr_1", "co_site"),
      ),
    ).rejects.toThrow(CompanyNotFoundError);
  });
});

describe("GetSubAccountMenuForStaffHandler", () => {
  it("rend `menu: null` sans carte", async () => {
    const view = await new GetSubAccountMenuForStaffHandler(new OneMenu(null)).execute(
      new GetSubAccountMenuForStaffQuery("co_site"),
    );
    expect(view).toEqual({ companyId: "co_site", menu: null });
  });
});

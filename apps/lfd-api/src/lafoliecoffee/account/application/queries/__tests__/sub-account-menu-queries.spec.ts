import type { CompanyStanding } from "../../../../shared/company-standing/domain/company-standing.js";
import type { PrincipalSitesMenuState } from "../../../domain/entities/principal-sites-menu.js";
import type { SubAccountMenuState } from "../../../domain/entities/sub-account-menu.js";
import { CompanyNotFoundError } from "../../../domain/errors/account-errors.js";
import {
  SitesMenuWriterRequiredError,
  SubAccountMenuWriterRequiredError,
} from "../../../domain/errors/sub-account-menu-errors.js";
import { PrincipalSitesMenuReader } from "../../../domain/ports/principal-sites-menu.reader.js";
import { SubAccountMenuAccessReader } from "../../../domain/ports/sub-account-menu-access.reader.js";
import {
  SubAccountMenuReader,
  type SiteMenus,
} from "../../../domain/ports/sub-account-menu.reader.js";
import { GetPrincipalSitesMenuHandler } from "../get-principal-sites-menu.handler.js";
import { GetPrincipalSitesMenuQuery } from "../get-principal-sites-menu.query.js";
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
  state: "own",
};
const COMMON: PrincipalSitesMenuState = {
  companyId: "co_principal",
  mode: "except",
  offMenu: "visible_locked",
  entries: [{ id: "ent_2", level: "family", ref: "fam_p", effect: "exclude" }],
  stamp: { author: { kind: "staff", staffId: "stf_1" }, at: AT },
};
const STATE_BODY = {
  mode: "only",
  offMenu: "hidden",
  entries: [{ level: "sku", ref: "CROI-1", effect: "include" }],
  updatedAt: AT.toISOString(),
  updatedBy: "principal",
};
const COMMON_BODY = {
  mode: "except",
  offMenu: "visible_locked",
  entries: [{ level: "family", ref: "fam_p", effect: "exclude" }],
  updatedAt: AT.toISOString(),
  updatedBy: "staff",
};

class SiteMenusOf extends SubAccountMenuReader {
  constructor(private readonly menus: SiteMenus) {
    super();
  }
  read(): Promise<SiteMenus> {
    return Promise.resolve(this.menus);
  }
}

class OneCommon extends PrincipalSitesMenuReader {
  constructor(private readonly state: PrincipalSitesMenuState | null) {
    super();
  }
  read(): Promise<PrincipalSitesMenuState | null> {
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
const PRINCIPAL_OWNER: CompanyStanding = SITE_OWNER;

describe("GetSubAccountMenuHandler — la carte d'un site", () => {
  it("rend la carte propre active à qui la règle, sans identifiant d'entrée", async () => {
    const view = await new GetSubAccountMenuHandler(
      new FixedStanding(HEIR),
      new SiteMenusOf({ own: STATE, common: COMMON }),
    ).execute(new GetSubAccountMenuQuery("usr_1", "co_site"));
    expect(view).toEqual({
      companyId: "co_site",
      state: "own",
      menu: STATE_BODY,
      common: COMMON_BODY,
    });
  });

  it("dit `common` quand la carte propre dort, et `none` sans carte du tout", async () => {
    const sleeping = await new GetSubAccountMenuHandler(
      new FixedStanding(HEIR),
      new SiteMenusOf({ own: { ...STATE, state: "follows_common" }, common: COMMON }),
    ).execute(new GetSubAccountMenuQuery("usr_1", "co_site"));
    expect(sleeping.state).toBe("common");
    const none = await new GetSubAccountMenuHandler(
      new FixedStanding(HEIR),
      new SiteMenusOf({ own: null, common: null }),
    ).execute(new GetSubAccountMenuQuery("usr_1", "co_site"));
    expect(none).toEqual({ companyId: "co_site", state: "none", menu: null, common: null });
  });

  it("le membre accepté du site la lit, en lecture seule (Hugo, 2026-11-20)", async () => {
    const view = await new GetSubAccountMenuHandler(
      new FixedStanding({ ...SITE_OWNER, own: "orders" }),
      new SiteMenusOf({ own: null, common: COMMON }),
    ).execute(new GetSubAccountMenuQuery("usr_2", "co_site"));
    expect(view.state).toBe("common");
  });

  it("refuse l'invité du site non entré, et l'étranger comme une société inconnue", async () => {
    await expect(
      new GetSubAccountMenuHandler(
        new FixedStanding({ ...SITE_OWNER, ownAccepted: false }),
        new SiteMenusOf({ own: STATE, common: null }),
      ).execute(new GetSubAccountMenuQuery("usr_1", "co_site")),
    ).rejects.toThrow(SubAccountMenuWriterRequiredError);
    await expect(
      new GetSubAccountMenuHandler(
        new FixedStanding(null),
        new SiteMenusOf({ own: STATE, common: null }),
      ).execute(new GetSubAccountMenuQuery("usr_1", "co_site")),
    ).rejects.toThrow(CompanyNotFoundError);
  });
});

describe("GetSubAccountMenuForStaffHandler", () => {
  it("rend `none` sans carte", async () => {
    const view = await new GetSubAccountMenuForStaffHandler(
      new SiteMenusOf({ own: null, common: null }),
    ).execute(new GetSubAccountMenuForStaffQuery("co_site"));
    expect(view).toEqual({ companyId: "co_site", state: "none", menu: null, common: null });
  });
});

describe("GetPrincipalSitesMenuHandler — la carte commune", () => {
  it("rend la carte commune au propriétaire du principal", async () => {
    const view = await new GetPrincipalSitesMenuHandler(
      new FixedStanding(PRINCIPAL_OWNER),
      new OneCommon(COMMON),
    ).execute(new GetPrincipalSitesMenuQuery("usr_1", "co_principal"));
    expect(view).toEqual({ companyId: "co_principal", menu: COMMON_BODY });
  });

  it("refuse l'admin hérité d'un autre principal et le membre `orders`", async () => {
    await expect(
      new GetPrincipalSitesMenuHandler(new FixedStanding(HEIR), new OneCommon(COMMON)).execute(
        new GetPrincipalSitesMenuQuery("usr_1", "co_principal"),
      ),
    ).rejects.toThrow(SitesMenuWriterRequiredError);
    await expect(
      new GetPrincipalSitesMenuHandler(
        new FixedStanding({ ...PRINCIPAL_OWNER, own: "orders" }),
        new OneCommon(COMMON),
      ).execute(new GetPrincipalSitesMenuQuery("usr_1", "co_principal")),
    ).rejects.toThrow(SitesMenuWriterRequiredError);
  });
});

import {
  DuplicateMenuEntryError,
  NotAPrincipalError,
} from "../../errors/sub-account-menu-errors.js";
import type { MenuStamp } from "../../value-objects/sub-account-menu-terms.js";
import { PrincipalSitesMenu } from "../principal-sites-menu.js";

const BY_STAFF: MenuStamp = { author: { kind: "staff", staffId: "stf_1" }, at: new Date(0) };

describe("PrincipalSitesMenu — la carte commune des sites (§ 6.1)", () => {
  it("se compose vide sur un principal, sans état : elle n'a pas de carte à remplacer", () => {
    const menu = PrincipalSitesMenu.compose({
      companyId: "co_principal",
      parentCompanyId: null,
      mode: "only",
      offMenu: "hidden",
      stamp: BY_STAFF,
    });
    expect(menu.toPersistence()).toEqual({
      companyId: "co_principal",
      mode: "only",
      offMenu: "hidden",
      entries: [],
      stamp: BY_STAFF,
    });
  });

  it("refuse une carte commune sur un site : un site n'a pas de sites", () => {
    expect(() =>
      PrincipalSitesMenu.compose({
        companyId: "co_site",
        parentCompanyId: "co_principal",
        mode: "only",
        offMenu: "hidden",
        stamp: BY_STAFF,
      }),
    ).toThrow(NotAPrincipalError);
  });

  it("partage la règle du corps : un article une fois par grain", () => {
    const menu = PrincipalSitesMenu.compose({
      companyId: "co_principal",
      parentCompanyId: null,
      mode: "except",
      offMenu: "visible_locked",
      stamp: BY_STAFF,
    });
    menu.exclude({ id: "e1", level: "product", ref: "TARTE" }, BY_STAFF);
    expect(() => menu.include({ id: "e2", level: "product", ref: " TARTE " }, BY_STAFF)).toThrow(
      DuplicateMenuEntryError,
    );
  });
});

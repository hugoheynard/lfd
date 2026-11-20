import { NotASubAccountError } from "../../errors/hierarchy-errors.js";
import {
  DuplicateMenuEntryError,
  EmptyMenuReferenceError,
  MenuEntryNotFoundError,
  UnknownMenuValueError,
} from "../../errors/sub-account-menu-errors.js";
import {
  parseMenuEffect,
  parseMenuLevel,
  parseMenuMode,
  parseOffMenuDisplay,
  type MenuStamp,
} from "../../value-objects/sub-account-menu-terms.js";
import { SubAccountMenu } from "../sub-account-menu.js";

const T0 = new Date(0);
const T1 = new Date(60_000);
const BY_STAFF: MenuStamp = { author: { kind: "staff", staffId: "stf_1" }, at: T0 };
const BY_PRINCIPAL: MenuStamp = { author: { kind: "customer", userId: "usr_1" }, at: T1 };

function aMenu(): SubAccountMenu {
  return SubAccountMenu.compose({
    companyId: "co_site",
    principalCompanyId: "co_principal",
    mode: "except",
    offMenu: "visible_locked",
    stamp: BY_STAFF,
  });
}

describe("SubAccountMenu", () => {
  it("se compose vide sur un sous-compte", () => {
    const menu = aMenu();
    expect(menu.toPersistence()).toEqual({
      companyId: "co_site",
      mode: "except",
      offMenu: "visible_locked",
      entries: [],
      stamp: BY_STAFF,
      state: "own",
    });
  });

  it("refuse une carte sur une société sans principal", () => {
    expect(() =>
      SubAccountMenu.compose({
        companyId: "co_alone",
        principalCompanyId: null,
        mode: "only",
        offMenu: "hidden",
        stamp: BY_STAFF,
      }),
    ).toThrow(NotASubAccountError);
  });

  it("inclut et exclut, référence débarrassée de ses blancs, et garde l'auteur du dernier geste", () => {
    const menu = aMenu();
    menu.exclude({ id: "e1", level: "family", ref: " fam_patisserie " }, BY_STAFF);
    menu.include({ id: "e2", level: "product", ref: "TARTE-CITRON" }, BY_PRINCIPAL);
    expect(menu.entries).toEqual([
      { id: "e1", level: "family", ref: "fam_patisserie", effect: "exclude" },
      { id: "e2", level: "product", ref: "TARTE-CITRON", effect: "include" },
    ]);
    expect(menu.stamp).toBe(BY_PRINCIPAL);
  });

  it("refuse un article déjà sur la carte, même avec l'effet contraire", () => {
    const menu = aMenu();
    menu.include({ id: "e1", level: "sku", ref: "SKU-1" }, BY_STAFF);
    expect(() => menu.exclude({ id: "e2", level: "sku", ref: " SKU-1" }, BY_STAFF)).toThrow(
      DuplicateMenuEntryError,
    );
    expect(menu.entries).toHaveLength(1);
  });

  it("admet la même référence à deux grains différents", () => {
    const menu = aMenu();
    menu.include({ id: "e1", level: "product", ref: "X" }, BY_STAFF);
    menu.exclude({ id: "e2", level: "sku", ref: "X" }, BY_STAFF);
    expect(menu.entries).toHaveLength(2);
  });

  it.each(["", "   "])("refuse une référence vide (%j)", (ref) => {
    expect(() => aMenu().include({ id: "e1", level: "family", ref }, BY_STAFF)).toThrow(
      EmptyMenuReferenceError,
    );
  });

  it("retire une entrée, et refuse d'en retirer une absente", () => {
    const menu = aMenu();
    menu.exclude({ id: "e1", level: "family", ref: "fam_a" }, BY_STAFF);
    menu.remove("family", "fam_a", BY_PRINCIPAL);
    expect(menu.entries).toEqual([]);
    expect(menu.stamp).toBe(BY_PRINCIPAL);
    expect(() => menu.remove("family", "fam_a", BY_STAFF)).toThrow(MenuEntryNotFoundError);
  });

  it("change de mode et de visibilité sans toucher aux entrées", () => {
    const menu = aMenu();
    menu.include({ id: "e1", level: "family", ref: "fam_a" }, BY_STAFF);
    menu.switchMode("only", BY_STAFF);
    menu.setOffMenu("hidden", BY_PRINCIPAL);
    expect(menu.mode).toBe("only");
    expect(menu.offMenu).toBe("hidden");
    expect(menu.entries).toHaveLength(1);
    expect(menu.stamp).toBe(BY_PRINCIPAL);
  });

  it("se relit tel qu'il s'écrit", () => {
    const menu = aMenu();
    menu.include({ id: "e1", level: "family", ref: "fam_a" }, BY_STAFF);
    expect(SubAccountMenu.reconstitute(menu.toPersistence()).toPersistence()).toEqual(
      menu.toPersistence(),
    );
  });
});

describe("les valeurs de la carte", () => {
  it("lit les valeurs connues", () => {
    expect(parseMenuMode("only")).toBe("only");
    expect(parseOffMenuDisplay("visible_locked")).toBe("visible_locked");
    expect(parseMenuLevel("sku")).toBe("sku");
    expect(parseMenuEffect("exclude")).toBe("exclude");
  });

  it.each([
    () => parseMenuMode("all"),
    () => parseOffMenuDisplay("locked"),
    () => parseMenuLevel("category"),
    () => parseMenuEffect("allow"),
  ])("refuse une valeur inconnue (%#)", (parse) => {
    expect(parse).toThrow(UnknownMenuValueError);
  });
});

describe("SubAccountMenu — suivre la carte commune (§ 6.1)", () => {
  it("bascule vers l'état visé, datée du geste ; déjà atteint, rien ne change", () => {
    const menu = aMenu();
    menu.exclude({ id: "e1", level: "family", ref: "fam_a" }, BY_STAFF);
    expect(menu.switchState("follows_common", BY_PRINCIPAL)).toBe(true);
    expect(menu.state).toBe("follows_common");
    expect(menu.stamp).toEqual(BY_PRINCIPAL);
    expect(menu.entries).toHaveLength(1);
    expect(menu.switchState("follows_common", BY_STAFF)).toBe(false);
    expect(menu.stamp).toEqual(BY_PRINCIPAL);
  });

  it("au changement de principal, dort sans changer d'auteur", () => {
    const menu = aMenu();
    expect(menu.fallBackToCommon()).toBe(true);
    expect(menu.state).toBe("follows_common");
    expect(menu.stamp).toEqual(BY_STAFF);
    expect(menu.fallBackToCommon()).toBe(false);
  });
});

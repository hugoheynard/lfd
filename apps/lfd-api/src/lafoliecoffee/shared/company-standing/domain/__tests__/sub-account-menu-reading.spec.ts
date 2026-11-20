import {
  menuReadingOf,
  UNREADABLE_MENU,
  type MenuRow,
  type SiteMenuRow,
} from "../sub-account-menu-reading.js";

const ROW: MenuRow = {
  mode: "except",
  offMenu: "visible_locked",
  entries: [{ level: "family", ref: "fam_a", effect: "exclude" }],
};
const OWN: SiteMenuRow = { ...ROW, state: "own" };
const COMMON: MenuRow = {
  mode: "only",
  offMenu: "hidden",
  entries: [{ level: "product", ref: "TARTE", effect: "include" }],
};

/** La carte ne compte que sous un principal actif (`carte-des-sites.md`, § 3.1, § 6.1). */
describe("menuReadingOf", () => {
  it("rend la carte d'un sous-compte sous un principal actif", () => {
    expect(menuReadingOf(OWN, null, "co_principal")).toEqual(ROW);
  });

  it("dort sans principal actif, carte propre comme carte commune", () => {
    expect(menuReadingOf(OWN, null, null)).toBeNull();
    expect(menuReadingOf(null, COMMON, null)).toBeNull();
  });

  it("rien sans carte", () => {
    expect(menuReadingOf(null, null, "co_principal")).toBeNull();
  });

  it("sans carte propre, la carte commune du principal compte", () => {
    expect(menuReadingOf(null, COMMON, "co_principal")).toEqual(COMMON);
  });

  it("une carte propre active remplace la commune, sans fusion", () => {
    expect(menuReadingOf(OWN, COMMON, "co_principal")).toEqual(ROW);
  });

  it("une carte propre `except` sans entrée exempte le site de la carte commune", () => {
    const free: SiteMenuRow = { mode: "except", offMenu: "hidden", entries: [], state: "own" };
    expect(menuReadingOf(free, COMMON, "co_principal")).toEqual({
      mode: "except",
      offMenu: "hidden",
      entries: [],
    });
  });

  it("une carte propre qui suit la commune dort : la commune compte, ou rien", () => {
    const sleeping: SiteMenuRow = { ...OWN, state: "follows_common" };
    expect(menuReadingOf(sleeping, COMMON, "co_principal")).toEqual(COMMON);
    expect(menuReadingOf(sleeping, null, "co_principal")).toBeNull();
  });

  it("un état inconnu ferme la carte entière, plutôt que de choisir une carte", () => {
    expect(menuReadingOf({ ...OWN, state: "both" }, COMMON, "co_principal")).toEqual(
      UNREADABLE_MENU,
    );
  });

  it("une en-tête inconnue ferme la carte entière, verrouillée", () => {
    expect(menuReadingOf({ ...OWN, mode: "all" }, null, "co_principal")).toEqual(UNREADABLE_MENU);
    expect(menuReadingOf({ ...OWN, offMenu: "grey" }, null, "co_principal")).toEqual(
      UNREADABLE_MENU,
    );
    expect(menuReadingOf(null, { ...COMMON, mode: "all" }, "co_principal")).toEqual(
      UNREADABLE_MENU,
    );
  });

  /**
   * Une exclusion écartée seule ouvrait, en `except`, l'article que le
   * principal avait fermé.
   */
  it("une entrée inconnue ferme la carte entière, plutôt que d'ouvrir ce qu'elle excluait", () => {
    const row: SiteMenuRow = {
      ...OWN,
      entries: [...ROW.entries, { level: "category", ref: "x", effect: "exclude" }],
    };
    expect(menuReadingOf(row, null, "co_principal")).toEqual(UNREADABLE_MENU);
    const badEffect: SiteMenuRow = {
      ...OWN,
      entries: [{ level: "sku", ref: "x", effect: "drop" }],
    };
    expect(menuReadingOf(badEffect, null, "co_principal")).toEqual(UNREADABLE_MENU);
  });
});

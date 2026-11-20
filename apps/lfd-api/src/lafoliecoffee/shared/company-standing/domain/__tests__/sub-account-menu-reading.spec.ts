import { menuReadingOf, UNREADABLE_MENU, type MenuRow } from "../sub-account-menu-reading.js";

const ROW: MenuRow = {
  mode: "except",
  offMenu: "visible_locked",
  entries: [{ level: "family", ref: "fam_a", effect: "exclude" }],
};

/** La carte ne compte que sous un principal actif (`carte-des-sites.md`, § 3.1). */
describe("menuReadingOf", () => {
  it("rend la carte d'un sous-compte sous un principal actif", () => {
    expect(menuReadingOf(ROW, "co_principal")).toEqual(ROW);
  });

  it("dort sans principal actif", () => {
    expect(menuReadingOf(ROW, null)).toBeNull();
  });

  it("rien sans carte", () => {
    expect(menuReadingOf(null, "co_principal")).toBeNull();
  });

  it("une en-tête inconnue ferme la carte entière, verrouillée", () => {
    expect(menuReadingOf({ ...ROW, mode: "all" }, "co_principal")).toEqual(UNREADABLE_MENU);
    expect(menuReadingOf({ ...ROW, offMenu: "grey" }, "co_principal")).toEqual(UNREADABLE_MENU);
  });

  /**
   * Une exclusion écartée seule ouvrait, en `except`, l'article que le
   * principal avait fermé.
   */
  it("une entrée inconnue ferme la carte entière, plutôt que d'ouvrir ce qu'elle excluait", () => {
    const row: MenuRow = {
      ...ROW,
      entries: [...ROW.entries, { level: "category", ref: "x", effect: "exclude" }],
    };
    expect(menuReadingOf(row, "co_principal")).toEqual(UNREADABLE_MENU);
    const badEffect: MenuRow = { ...ROW, entries: [{ level: "sku", ref: "x", effect: "drop" }] };
    expect(menuReadingOf(badEffect, "co_principal")).toEqual(UNREADABLE_MENU);
  });
});

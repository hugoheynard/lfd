import { menuReadingOf, type MenuRow } from "../sub-account-menu-reading.js";

const ROW: MenuRow = {
  mode: "except",
  offMenu: "visible_locked",
  entries: [{ level: "family", ref: "fam_a", effect: "exclude" }],
};

/** La carte ne compte que sous un principal actif (`plan-carte-des-sites.md`, § 3.1). */
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

  it("une en-tête inconnue rend la carte entière muette, plutôt qu'à moitié lue", () => {
    expect(menuReadingOf({ ...ROW, mode: "all" }, "co_principal")).toBeNull();
  });

  it("une entrée inconnue est écartée seule", () => {
    const row: MenuRow = {
      ...ROW,
      entries: [...ROW.entries, { level: "category", ref: "x", effect: "exclude" }],
    };
    expect(menuReadingOf(row, "co_principal")?.entries).toEqual(ROW.entries);
  });
});

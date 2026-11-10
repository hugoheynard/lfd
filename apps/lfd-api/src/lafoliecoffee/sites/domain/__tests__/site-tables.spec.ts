import { PickupDiscount } from "../../../pickup-addresses/domain/pickup-discount.js";
import { Site, type SitePlace } from "../site.js";
import {
  ArchivedSiteError,
  EatInSiteWithTablesError,
  SiteTableCountError,
  SiteTableNotFoundError,
  SiteTablesWithoutEatInError,
} from "../site-errors.js";
import { MAX_SITE_TABLES, SiteTables } from "../site-tables.js";

const PLACE: SitePlace = {
  label: "Val Village",
  ligne1: "1 place du Village",
  ligne2: "",
  codePostal: "73150",
  ville: "Val-d'Isère",
  pays: "France",
  opening: { publicOpening: null, proPickup: null },
  gps: null,
  discount: PickupDiscount.of({ b2b: null, b2c: null }),
};

/** Une date comparée à aucune horloge : elle n'est que recopiée. */
const AT = new Date(0);

function site(eatIn: boolean, archivedAt: Date | null = null): Site {
  const fresh = Site.declare("site_village", PLACE).snapshot();
  return Site.rehydrate({ ...fresh, roles: { ...fresh.roles, eatIn }, archivedAt });
}

function gridOf(count: number): SiteTables {
  const grid = SiteTables.empty("site_village");
  grid.setCount(count, site(true));
  return grid;
}

describe("Site — la case « Sur place »", () => {
  it("naît sans salle", () => {
    expect(Site.declare("s", PLACE).eatIn).toBe(false);
  });

  it("s'ouvre par les rôles, sans règle croisée (Q2)", () => {
    const village = site(false);
    village.assignRoles({ ...village.snapshot().roles, eatIn: true });
    expect(village.eatIn).toBe(true);
  });

  it("refuse de fermer une salle qui a des tables, en nommant le geste de sortie", () => {
    const village = site(true);
    expect(() =>
      village.assignRoles({ ...village.snapshot().roles, eatIn: false }, undefined, false, 3),
    ).toThrow(EatInSiteWithTablesError);
    expect(village.eatIn).toBe(true);
  });

  it("ferme une salle sans table", () => {
    const village = site(true);
    village.assignRoles({ ...village.snapshot().roles, eatIn: false }, undefined, false, 0);
    expect(village.eatIn).toBe(false);
  });
});

describe("SiteTables", () => {
  it("numérote les tables de 1 à N, sans QR", () => {
    expect(gridOf(3).snapshot().tables).toEqual([
      { number: 1, token: null, qrCreatedAt: null },
      { number: 2, token: null, qrCreatedAt: null },
      { number: 3, token: null, qrCreatedAt: null },
    ]);
  });

  it("refuse une grille sur un site sans « Sur place » (Q4)", () => {
    expect(() => SiteTables.empty("site_village").setCount(2, site(false))).toThrow(
      SiteTablesWithoutEatInError,
    );
  });

  it("laisse ramener à 0 un site sans salle", () => {
    const grid = SiteTables.empty("site_village");
    grid.setCount(0, site(false));
    expect(grid.count).toBe(0);
  });

  it.each([-1, 1.5, MAX_SITE_TABLES + 1])("refuse %p tables", (count) => {
    expect(() => SiteTables.empty("site_village").setCount(count, site(true))).toThrow(
      SiteTableCountError,
    );
  });

  it("accepte la borne", () => {
    expect(gridOf(MAX_SITE_TABLES).count).toBe(MAX_SITE_TABLES);
  });

  it("refuse tout geste sur un site archivé", () => {
    const archived = site(true, AT);
    const grid = gridOf(2);
    expect(() => grid.setCount(3, archived)).toThrow(ArchivedSiteError);
    expect(() => grid.attachQr(1, "tok", AT, archived)).toThrow(ArchivedSiteError);
    expect(() => grid.detachQr(1, archived)).toThrow(ArchivedSiteError);
  });

  it("garde le QR des tables restantes quand on en ajoute ou en retire en fin de grille", () => {
    const grid = gridOf(3);
    grid.attachQr(1, "tok_1", AT, site(true));
    grid.attachQr(3, "tok_3", AT, site(true));
    grid.setCount(2, site(true));
    grid.setCount(4, site(true));
    expect(grid.snapshot().tables).toEqual([
      { number: 1, token: "tok_1", qrCreatedAt: AT },
      { number: 2, token: null, qrCreatedAt: null },
      { number: 3, token: null, qrCreatedAt: null },
      { number: 4, token: null, qrCreatedAt: null },
    ]);
  });

  it("remplace le jeton à la régénération, et l'efface au retrait", () => {
    const grid = gridOf(1);
    grid.attachQr(1, "old", AT, site(true));
    grid.attachQr(1, "new", AT, site(true));
    expect(grid.snapshot().tables[0]?.token).toBe("new");
    grid.detachQr(1, site(true));
    expect(grid.snapshot().tables[0]).toEqual({ number: 1, token: null, qrCreatedAt: null });
  });

  it("refuse un QR sur une table qui n'existe pas", () => {
    const grid = gridOf(2);
    expect(() => grid.attachQr(3, "tok", AT, site(true))).toThrow(SiteTableNotFoundError);
    expect(() => grid.detachQr(0, site(true))).toThrow(SiteTableNotFoundError);
  });
});

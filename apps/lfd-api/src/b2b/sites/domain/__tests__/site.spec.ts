import { PickupDiscount } from "../../../pickup-addresses/domain/pickup-discount.js";
import { Site, type SiteColors, type SitePlace, type SiteRoles } from "../site.js";
import { SiteColor } from "../site-color.js";
import {
  ArchivedSiteError,
  DefaultSiteArchiveError,
  DefaultSiteMustHandOverError,
  DispatchingSiteArchiveError,
  SiteColorErasedError,
  SiteCounterSetupError,
  SiteDispatchesFromTransferError,
  SiteTransferWithoutHandoverError,
} from "../site-errors.js";

const PLACE: SitePlace = {
  label: "Val Village",
  ligne1: "1 place du Village",
  ligne2: "",
  codePostal: "73150",
  ville: "Val-d'Isère",
  pays: "France",
  opening: { publicOpening: null, proPickup: null },
  gps: { lat: 45.45, lng: 6.98 },
  discount: PickupDiscount.of(null, { b2b: true, b2c: true }),
};

const ROLES: SiteRoles = {
  handsOver: true,
  supply: "on_site",
  dispatches: false,
  transferMode: "integrated",
  counterSetupMinutes: 0,
};

const NO_COLORS: SiteColors = {
  pickupB2b: null,
  pickupB2c: null,
  deliveryB2b: null,
  deliveryB2c: null,
};

/** Un instant quelconque : seul l'archivage le lit, sans le comparer à l'horloge. */
const AT = new Date(0);

function site(): Site {
  return Site.declare("site_1", PLACE, false);
}

describe("Site.declare — l'existant pour un site neuf", () => {
  it("remet, est approvisionné sur place, n'expédie pas, sans couleur ni archivage", () => {
    const state = site().snapshot();
    expect(state.roles).toEqual(ROLES);
    expect(state.colors).toEqual(NO_COLORS);
    expect(state.archivedAt).toBeNull();
  });
});

describe("Site.assignRoles — la cohérence des rôles", () => {
  it("accepte un site servi par transfert qui remet", () => {
    const village = site();
    village.assignRoles({ ...ROLES, supply: "transfer", transferMode: "dedicated" });
    expect(village.snapshot().roles.supply).toBe("transfer");
  });

  it("refuse un site servi par transfert qui ne remet pas", () => {
    expect(() => site().assignRoles({ ...ROLES, supply: "transfer", handsOver: false })).toThrow(
      SiteTransferWithoutHandoverError,
    );
  });

  it("refuse un site qui expédie en étant servi par transfert", () => {
    expect(() => site().assignRoles({ ...ROLES, supply: "transfer", dispatches: true })).toThrow(
      SiteDispatchesFromTransferError,
    );
  });

  it("accepte un fournil qui expédie sans remettre", () => {
    const bakery = site();
    bakery.assignRoles({ ...ROLES, handsOver: false, dispatches: true });
    expect(bakery.snapshot().roles).toMatchObject({ handsOver: false, dispatches: true });
  });

  it.each([-1, 2.5])("refuse une mise en place de %s min", (minutes) => {
    expect(() => site().assignRoles({ ...ROLES, counterSetupMinutes: minutes })).toThrow(
      SiteCounterSetupError,
    );
  });

  it("refuse que le site par défaut cesse de remettre", () => {
    const main = Site.declare("site_1", PLACE, true);
    expect(() => main.assignRoles({ ...ROLES, handsOver: false })).toThrow(
      DefaultSiteMustHandOverError,
    );
  });

  it("rehydrate revalide : une ligne incohérente ne se relit pas", () => {
    const state = site().snapshot();
    expect(() =>
      Site.rehydrate({ ...state, roles: { ...ROLES, supply: "transfer", handsOver: false } }),
    ).toThrow(SiteTransferWithoutHandoverError);
  });
});

describe("Site.paint — des couleurs qu'on change sans les effacer", () => {
  const BLUE = SiteColor.of("#2563eb");
  const GREY = SiteColor.of("#9ca3af");

  /** Objection B1 : les lignes existantes n'ont aucune couleur, et se relisent. */
  it("tolère l'absence : un site sans couleur se relit et se peint", () => {
    const village = Site.rehydrate(site().snapshot());
    village.paint({ ...NO_COLORS, pickupB2c: GREY });
    expect(village.snapshot().colors.pickupB2c).toBe(GREY);
  });

  it("change une couleur posée", () => {
    const village = site();
    village.paint({ ...NO_COLORS, pickupB2c: GREY });
    village.paint({ ...NO_COLORS, pickupB2c: BLUE });
    expect(village.snapshot().colors.pickupB2c).toBe(BLUE);
  });

  it("refuse d'effacer une couleur posée, en la nommant", () => {
    const village = site();
    village.paint({ ...NO_COLORS, deliveryB2b: BLUE });
    expect(() => village.paint(NO_COLORS)).toThrow(SiteColorErasedError);
    expect(() => village.paint(NO_COLORS)).toThrow(/livraison pro/u);
  });
});

describe("Site.archive — archiver plutôt que supprimer", () => {
  it("archive un site ordinaire", () => {
    const village = site();
    village.archive(AT);
    expect(village.isArchived).toBe(true);
    expect(village.snapshot().archivedAt).toBe(AT);
  });

  it("refuse d'archiver le site par défaut", () => {
    expect(() => Site.declare("site_1", PLACE, true).archive(AT)).toThrow(DefaultSiteArchiveError);
  });

  it("refuse d'archiver le site d'où partent les livraisons", () => {
    const bakery = site();
    bakery.assignRoles({ ...ROLES, dispatches: true });
    expect(() => bakery.archive(AT)).toThrow(DispatchingSiteArchiveError);
  });

  it("un site archivé ne se modifie plus, ni ne devient le défaut", () => {
    const village = site();
    village.archive(AT);
    expect(() => village.archive(AT)).toThrow(ArchivedSiteError);
    expect(() => village.revise(PLACE)).toThrow(ArchivedSiteError);
    expect(() => village.assignRoles(ROLES)).toThrow(ArchivedSiteError);
    expect(() => village.paint(NO_COLORS)).toThrow(ArchivedSiteError);
    expect(() => village.makeDefault()).toThrow(ArchivedSiteError);
  });
});

describe("Site.makeDefault — le défaut est proposé au checkout", () => {
  it("refuse un site qui ne remet pas", () => {
    const bakery = site();
    bakery.assignRoles({ ...ROLES, handsOver: false, dispatches: true });
    expect(() => bakery.makeDefault()).toThrow(DefaultSiteMustHandOverError);
  });
});

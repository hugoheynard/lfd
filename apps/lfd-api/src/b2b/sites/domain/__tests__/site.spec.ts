import { PickupDiscount } from "../../../pickup-addresses/domain/pickup-discount.js";
import { Site, type SiteColors, type SitePlace, type SiteRoles } from "../site.js";
import { SiteColor } from "../site-color.js";
import {
  ArchivedSiteError,
  DepartureSiteMustDeliverError,
  DeliveryDepartureSiteArchiveError,
  SiteCounterSetupError,
  SiteDeliveryDepartureFromTransferError,
  SiteDeliveryDepartureWithoutGpsError,
  SitePickupWithoutAudienceError,
  SiteTransferWithoutGpsError,
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
  pickup: true,
  pickupAudiences: { b2b: true, b2c: true },
  supply: "on_site",
  deliveryDeparture: false,
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
  return Site.declare("site_1", PLACE);
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
    expect(() => site().assignRoles({ ...ROLES, supply: "transfer", pickup: false })).toThrow(
      SiteTransferWithoutHandoverError,
    );
  });

  it("refuse un site qui expédie en étant servi par transfert", () => {
    expect(() =>
      site().assignRoles({ ...ROLES, supply: "transfer", deliveryDeparture: true }),
    ).toThrow(SiteDeliveryDepartureFromTransferError);
  });

  it("accepte un fournil qui expédie sans remettre", () => {
    const bakery = site();
    bakery.assignRoles({ ...ROLES, pickup: false, deliveryDeparture: true });
    expect(bakery.snapshot().roles).toMatchObject({ pickup: false, deliveryDeparture: true });
  });

  it.each([-1, 2.5])("refuse une mise en place de %s min", (minutes) => {
    expect(() => site().assignRoles({ ...ROLES, counterSetupMinutes: minutes })).toThrow(
      SiteCounterSetupError,
    );
  });

  /**
   * Le site par défaut a disparu (Hugo, 2026-10-15) : le premier site créé
   * peut cesser de remettre comme les autres, rien ne le distingue plus.
   */
  it("laisse n'importe quel site cesser de remettre, le premier créé compris", () => {
    const first = Site.declare("site_1", PLACE);
    first.assignRoles({ ...ROLES, pickup: false, deliveryDeparture: true });
    expect(first.snapshot().roles.pickup).toBe(false);
  });

  it("rehydrate revalide : une ligne incohérente ne se relit pas", () => {
    const state = site().snapshot();
    expect(() =>
      Site.rehydrate({ ...state, roles: { ...ROLES, supply: "transfer", pickup: false } }),
    ).toThrow(SiteTransferWithoutHandoverError);
  });
});

describe("Site.assignRoles — le retrait par clientèle (Hugo, 2026-10-15)", () => {
  it("un site neuf remet aux deux clientèles : l'existant", () => {
    expect(site().snapshot().roles.pickupAudiences).toEqual({ b2b: true, b2c: true });
  });

  it("réserve le retrait aux pros", () => {
    const labo = site();
    labo.assignRoles({ ...ROLES, pickupAudiences: { b2b: true, b2c: false } });
    expect(labo.snapshot().roles.pickupAudiences).toEqual({ b2b: true, b2c: false });
  });

  it("refuse un retrait ouvert à personne, en nommant les deux cases", () => {
    expect(() =>
      site().assignRoles({ ...ROLES, pickupAudiences: { b2b: false, b2c: false } }),
    ).toThrow(/Retrait pour les pros.*Retrait pour les particuliers/u);
    expect(() =>
      site().assignRoles({ ...ROLES, pickupAudiences: { b2b: false, b2c: false } }),
    ).toThrow(SitePickupWithoutAudienceError);
  });

  it("ignore les cases d'un site sans retrait, et les garde telles quelles", () => {
    const bakery = site();
    bakery.assignRoles({ ...ROLES, pickup: false, pickupAudiences: { b2b: false, b2c: false } });
    expect(bakery.snapshot().roles).toMatchObject({
      pickup: false,
      pickupAudiences: { b2b: false, b2c: false },
    });
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

  it("revient à « pas de couleur » : une couleur posée s'efface (Hugo, 2026-10-13)", () => {
    const village = site();
    village.paint({ ...NO_COLORS, deliveryB2b: BLUE });
    village.paint(NO_COLORS);
    expect(village.snapshot().colors.deliveryB2b).toBeNull();
  });
});

describe("Site.archive — archiver plutôt que supprimer", () => {
  it("archive un site ordinaire", () => {
    const village = site();
    village.archive(AT);
    expect(village.isArchived).toBe(true);
    expect(village.snapshot().archivedAt).toBe(AT);
  });

  it("archive le premier site créé comme un autre : il n'y a plus de défaut", () => {
    const first = Site.declare("site_1", PLACE);
    first.archive(AT);
    expect(first.isArchived).toBe(true);
  });

  it("ne porte plus aucun rang de défaut dans son état", () => {
    expect(Object.keys(Site.declare("site_1", PLACE).snapshot())).not.toContain("isDefault");
  });

  it("refuse d'archiver le site d'où partent les livraisons", () => {
    const bakery = site();
    bakery.assignRoles({ ...ROLES, deliveryDeparture: true });
    expect(() => bakery.archive(AT)).toThrow(DeliveryDepartureSiteArchiveError);
  });

  it("un site archivé ne se modifie plus", () => {
    const village = site();
    village.archive(AT);
    expect(() => village.archive(AT)).toThrow(ArchivedSiteError);
    expect(() => village.revise(PLACE)).toThrow(ArchivedSiteError);
    expect(() => village.assignRoles(ROLES)).toThrow(ArchivedSiteError);
    expect(() => village.paint(NO_COLORS)).toThrow(ArchivedSiteError);
  });
});

describe("Site — un site qui expédie a un point GPS (Hugo, 2026-10-13)", () => {
  const NO_GPS: SitePlace = { ...PLACE, gps: null };

  it("refuse de cocher « Livraison » sans point GPS, en disant où le renseigner (sous « Livraison »)", () => {
    const bakery = Site.declare("site_1", NO_GPS);
    expect(() => bakery.assignRoles({ ...ROLES, deliveryDeparture: true })).toThrow(
      SiteDeliveryDepartureWithoutGpsError,
    );
    expect(() => bakery.assignRoles({ ...ROLES, deliveryDeparture: true })).toThrow(
      /sous « Livraison »/u,
    );
    expect(bakery.snapshot().roles.deliveryDeparture).toBe(false);
  });

  it("refuse d'effacer le point d'un site qui expédie", () => {
    const bakery = site();
    bakery.assignRoles({ ...ROLES, deliveryDeparture: true });
    expect(() => bakery.revise(NO_GPS)).toThrow(SiteDeliveryDepartureWithoutGpsError);
    expect(bakery.snapshot().place.gps).toEqual(PLACE.gps);
  });

  it("laisse effacer le point d'un site qui n'expédie pas", () => {
    const village = site();
    village.revise(NO_GPS);
    expect(village.snapshot().place.gps).toBeNull();
  });

  /**
   * La migration S1 a posé `deliveryDeparture = true` sans regarder le GPS : la
   * ligne se relit, et ses autres gestes passent — seul ce qui l'aggraverait
   * est refusé.
   */
  it("tolère au chargement un site qui expédie déjà sans point GPS", () => {
    const legacy = Site.rehydrate({
      id: "site_1",
      place: NO_GPS,
      roles: { ...ROLES, deliveryDeparture: true },
      colors: NO_COLORS,
      archivedAt: null,
    });
    legacy.assignRoles({ ...ROLES, deliveryDeparture: true, counterSetupMinutes: 10 });
    legacy.revise({ ...NO_GPS, label: "Fournil" });
    expect(legacy.snapshot().roles.counterSetupMinutes).toBe(10);
    expect(legacy.label).toBe("Fournil");
  });
});

describe("Site — un site servi par transfert a un point GPS (Hugo, 2026-10-13)", () => {
  const NO_GPS: SitePlace = { ...PLACE, gps: null };

  it("refuse de passer « par transfert » sans point, en disant où le saisir", () => {
    const village = Site.declare("site_1", NO_GPS);
    expect(() => village.assignRoles({ ...ROLES, supply: "transfer" })).toThrow(
      SiteTransferWithoutGpsError,
    );
    expect(() => village.assignRoles({ ...ROLES, supply: "transfer" })).toThrow(
      /Approvisionné par transfert/u,
    );
  });

  it("accepte le transfert quand le point arrive dans la même écriture", () => {
    const village = Site.declare("site_1", NO_GPS);
    village.assignRoles({ ...ROLES, supply: "transfer" }, { lat: 45.45, lng: 6.98 });
    expect(village.snapshot().roles.supply).toBe("transfer");
  });

  it("refuse d'effacer le point d'un site servi par transfert", () => {
    const village = site();
    village.assignRoles({ ...ROLES, supply: "transfer" });
    expect(() => village.revise(NO_GPS)).toThrow(SiteTransferWithoutGpsError);
    expect(() => village.assignRoles({ ...ROLES, supply: "transfer" }, null)).toThrow(
      SiteTransferWithoutGpsError,
    );
  });

  it("tolère au chargement un site déjà servi par transfert sans point", () => {
    const legacy = Site.rehydrate({
      id: "site_1",
      place: NO_GPS,
      roles: { ...ROLES, supply: "transfer" },
      colors: NO_COLORS,
      archivedAt: null,
    });
    legacy.assignRoles({ ...ROLES, supply: "transfer", counterSetupMinutes: 5 });
    expect(legacy.snapshot().roles.counterSetupMinutes).toBe(5);
  });
});

describe("Site — le départ des tournées livre (Hugo, 2026-10-13)", () => {
  it("refuse de retirer « Livraison » au départ, en nommant où en choisir un autre", () => {
    const bakery = site();
    bakery.assignRoles({ ...ROLES, deliveryDeparture: true });
    expect(() => bakery.assignRoles(ROLES, undefined, true)).toThrow(DepartureSiteMustDeliverError);
    expect(() => bakery.assignRoles(ROLES, undefined, true)).toThrow(
      /Livraison › Point de départ/u,
    );
    expect(bakery.snapshot().roles.deliveryDeparture).toBe(true);
  });

  it("laisse retirer « Livraison » à un site qui n'est pas le départ", () => {
    const village = site();
    village.assignRoles({ ...ROLES, deliveryDeparture: true });
    village.assignRoles(ROLES, undefined, false);
    expect(village.snapshot().roles.deliveryDeparture).toBe(false);
  });
});

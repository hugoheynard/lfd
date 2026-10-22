import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { CreatePickupAddressCommand } from "../../../pickup-addresses/application/create-pickup-address.command.js";
import { CreatePickupAddressHandler } from "../../../pickup-addresses/application/create-pickup-address.handler.js";
import { RemovePickupAddressCommand } from "../../../pickup-addresses/application/remove-pickup-address.command.js";
import { RemovePickupAddressHandler } from "../../../pickup-addresses/application/remove-pickup-address.handler.js";
import { PickupAddressNotFoundError } from "../../../pickup-addresses/domain/pickup-errors.js";
import { SiteColor } from "../../domain/site-color.js";
import {
  DepartureSiteMustDeliverError,
  SiteDeliveryDepartureWithoutGpsError,
  SitePickupWithoutAudienceError,
  SiteTransferWithoutGpsError,
  SiteTransferWithoutHandoverError,
} from "../../domain/site-errors.js";
import { SetSiteColorsCommand } from "../set-site-colors.command.js";
import { SetSiteColorsHandler } from "../set-site-colors.handler.js";
import { SetSiteRolesCommand } from "../set-site-roles.command.js";
import { SetSiteRolesHandler } from "../set-site-roles.handler.js";
import {
  FixedDepartureSite,
  InMemorySites,
  InMemorySiteTables,
  PLACE,
  storedSite,
} from "./site-doubles.js";

const ROLES = {
  pickup: true,
  supply: "transfer",
  deliveryDeparture: false,
  transferMode: "integrated",
  counterSetupMinutes: 15,
  eatIn: false,
} as const;

/** L'existant : le retrait ouvert aux deux clientèles. */
const BOTH = { b2b: true, b2c: true } as const;

/** Un site réservé aux particuliers, tel qu'il est en base. */
const RESERVED_ROLES = {
  ...ROLES,
  pickupAudiences: { b2b: false, b2c: true },
} as const;

const NO_COLORS = {
  pickupColorB2b: null,
  pickupColorB2c: null,
  deliveryColorB2b: null,
  deliveryColorB2c: null,
} as const;

const GPS = { lat: 45.45, lng: 6.98 };

/** Le fournil (créé le premier) et le village, en base. */
function twoSites(): InMemorySites {
  return new InMemorySites(storedSite("site_bakery"), storedSite("site_village"));
}

/** Le village AVEC son point GPS : celui qu'il faut pour un transfert. */
function locatedVillage(): InMemorySites {
  return new InMemorySites(storedSite("site_village", { place: { ...PLACE, gps: GPS } }));
}

describe("SetSiteRolesHandler", () => {
  it("enregistre les rôles et les journalise", async () => {
    const sites = locatedVillage();
    const events = new RecordingPublisher();

    await new SetSiteRolesHandler(
      sites,
      events,
      new DirectUnitOfWork(),
      new FixedDepartureSite(),
      new InMemorySiteTables(),
    ).execute(new SetSiteRolesCommand("site_village", ROLES));

    // Les clientèles du retrait, absentes de la charge, restent celles du site.
    expect(sites.stateOf("site_village")?.roles).toEqual({
      ...ROLES,
      pickupAudiences: { b2b: true, b2c: true },
    });
    expect(events.factTypes()).toEqual(["pickup_address.roles_set"]);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      subjectLabel: "Laboratoire",
      supply: "transfer",
      counterSetupMinutes: 15,
    });
  });

  it("réserve le retrait aux pros, et le journalise (Hugo, 2026-10-15)", async () => {
    const sites = locatedVillage();
    const events = new RecordingPublisher();

    await new SetSiteRolesHandler(
      sites,
      events,
      new DirectUnitOfWork(),
      new FixedDepartureSite(),
      new InMemorySiteTables(),
    ).execute(
      new SetSiteRolesCommand("site_village", {
        ...ROLES,
        pickupAudiences: { b2b: true, b2c: false },
      }),
    );

    expect(sites.stateOf("site_village")?.roles.pickupAudiences).toEqual({ b2b: true, b2c: false });
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      pickupForB2b: true,
      pickupForB2c: false,
    });
  });

  it("garde un site réservé quand la charge n'envoie pas les cases (absent = inchangé)", async () => {
    const reserved = storedSite("site_village", {
      place: { ...PLACE, gps: GPS },
      roles: RESERVED_ROLES,
    });
    const sites = new InMemorySites(reserved);

    await new SetSiteRolesHandler(
      sites,
      new RecordingPublisher(),
      new DirectUnitOfWork(),
      new FixedDepartureSite(),
      new InMemorySiteTables(),
    ).execute(new SetSiteRolesCommand("site_village", ROLES));

    expect(sites.stateOf("site_village")?.roles.pickupAudiences).toEqual({ b2b: false, b2c: true });
  });

  it("refuse un retrait ouvert à personne sans rien écrire", async () => {
    const sites = locatedVillage();
    const events = new RecordingPublisher();

    await expect(
      new SetSiteRolesHandler(
        sites,
        events,
        new DirectUnitOfWork(),
        new FixedDepartureSite(),
        new InMemorySiteTables(),
      ).execute(
        new SetSiteRolesCommand("site_village", {
          ...ROLES,
          pickupAudiences: { b2b: false, b2c: false },
        }),
      ),
    ).rejects.toBeInstanceOf(SitePickupWithoutAudienceError);
    expect(sites.saved).toEqual([]);
    expect(events.traced).toHaveLength(0);
  });

  it("refuse des rôles incohérents sans rien écrire ni journaliser", async () => {
    const sites = twoSites();
    const events = new RecordingPublisher();

    await expect(
      new SetSiteRolesHandler(
        sites,
        events,
        new DirectUnitOfWork(),
        new FixedDepartureSite(),
        new InMemorySiteTables(),
      ).execute(new SetSiteRolesCommand("site_village", { ...ROLES, pickup: false })),
    ).rejects.toBeInstanceOf(SiteTransferWithoutHandoverError);
    expect(sites.saved).toEqual([]);
    expect(events.traced).toHaveLength(0);
  });

  it("refuse de faire expédier un site sans point GPS, sans rien écrire ni journaliser", async () => {
    const sites = twoSites();
    const events = new RecordingPublisher();

    await expect(
      new SetSiteRolesHandler(
        sites,
        events,
        new DirectUnitOfWork(),
        new FixedDepartureSite(),
        new InMemorySiteTables(),
      ).execute(
        new SetSiteRolesCommand("site_village", {
          ...ROLES,
          supply: "on_site",
          deliveryDeparture: true,
        }),
      ),
    ).rejects.toBeInstanceOf(SiteDeliveryDepartureWithoutGpsError);
    expect(sites.saved).toEqual([]);
    expect(events.traced).toHaveLength(0);
  });

  it("fait expédier un site qui a son point GPS", async () => {
    const sites = new InMemorySites(storedSite("site_village", { place: { ...PLACE, gps: GPS } }));
    await new SetSiteRolesHandler(
      sites,
      new RecordingPublisher(),
      new DirectUnitOfWork(),
      new FixedDepartureSite(),
      new InMemorySiteTables(),
    ).execute(
      new SetSiteRolesCommand("site_village", {
        ...ROLES,
        supply: "on_site",
        deliveryDeparture: true,
      }),
    );
    expect(sites.stateOf("site_village")?.roles.deliveryDeparture).toBe(true);
  });

  it("refuse de servir par transfert un site sans point GPS (Hugo, 2026-10-13)", async () => {
    const sites = twoSites();
    await expect(
      new SetSiteRolesHandler(
        sites,
        new RecordingPublisher(),
        new DirectUnitOfWork(),
        new FixedDepartureSite(),
        new InMemorySiteTables(),
      ).execute(new SetSiteRolesCommand("site_village", ROLES)),
    ).rejects.toBeInstanceOf(SiteTransferWithoutGpsError);
    expect(sites.saved).toEqual([]);
  });

  it("sert par transfert en posant le point dans la même écriture", async () => {
    const sites = twoSites();
    await new SetSiteRolesHandler(
      sites,
      new RecordingPublisher(),
      new DirectUnitOfWork(),
      new FixedDepartureSite(),
      new InMemorySiteTables(),
    ).execute(new SetSiteRolesCommand("site_village", { ...ROLES, gps: GPS }));
    expect(sites.stateOf("site_village")?.place.gps).toEqual(GPS);
  });

  it("refuse de retirer « Livraison » au départ des tournées (Hugo, 2026-10-13)", async () => {
    const sites = new InMemorySites(
      storedSite("site_bakery", {
        place: { ...PLACE, gps: GPS },
        roles: { ...ROLES, pickupAudiences: BOTH, supply: "on_site", deliveryDeparture: true },
      }),
    );
    const departure = new FixedDepartureSite("site_bakery");
    await expect(
      new SetSiteRolesHandler(
        sites,
        new RecordingPublisher(),
        new DirectUnitOfWork(),
        departure,
        new InMemorySiteTables(),
      ).execute(new SetSiteRolesCommand("site_bakery", { ...ROLES, supply: "on_site" })),
    ).rejects.toBeInstanceOf(DepartureSiteMustDeliverError);
    expect(sites.saved).toEqual([]);
  });

  it("laisse retirer « Livraison » à un site qui n'est pas le départ", async () => {
    const sites = new InMemorySites(
      storedSite("site_village", {
        place: { ...PLACE, gps: GPS },
        roles: { ...ROLES, pickupAudiences: BOTH, supply: "on_site", deliveryDeparture: true },
      }),
    );
    await new SetSiteRolesHandler(
      sites,
      new RecordingPublisher(),
      new DirectUnitOfWork(),
      new FixedDepartureSite("site_bakery"),
      new InMemorySiteTables(),
    ).execute(new SetSiteRolesCommand("site_village", { ...ROLES, supply: "on_site" }));
    expect(sites.stateOf("site_village")?.roles.deliveryDeparture).toBe(false);
  });

  it("ne demande le départ à la livraison que si « Livraison » est retirée", async () => {
    const departure = new FixedDepartureSite("site_village");
    await new SetSiteRolesHandler(
      locatedVillage(),
      new RecordingPublisher(),
      new DirectUnitOfWork(),
      departure,
      new InMemorySiteTables(),
    ).execute(new SetSiteRolesCommand("site_village", ROLES));
    expect(departure.reads).toBe(0);
  });

  it("un site inconnu est un 404", async () => {
    await expect(
      new SetSiteRolesHandler(
        twoSites(),
        new RecordingPublisher(),
        new DirectUnitOfWork(),
        new FixedDepartureSite(),
        new InMemorySiteTables(),
      ).execute(new SetSiteRolesCommand("site_absent", ROLES)),
    ).rejects.toBeInstanceOf(PickupAddressNotFoundError);
  });
});

describe("SetSiteColorsHandler", () => {
  async function paint(
    sites: InMemorySites,
    colors: typeof NO_COLORS | Record<string, string | null>,
  ): Promise<RecordingPublisher> {
    const events = new RecordingPublisher();
    await new SetSiteColorsHandler(sites, events, new DirectUnitOfWork()).execute(
      new SetSiteColorsCommand("site_village", { ...NO_COLORS, ...colors }),
    );
    return events;
  }

  it("normalise en minuscules et enregistre", async () => {
    const sites = twoSites();
    await paint(sites, { pickupColorB2c: "#9CA3AF" });
    expect(sites.stateOf("site_village")?.colors.pickupB2c?.hex).toBe("#9ca3af");
  });

  it("enregistre un vert : aucune teinte n'est réservée (Hugo, 2026-10-13)", async () => {
    const sites = twoSites();
    await paint(sites, { pickupColorB2b: "#16a34a" });
    expect(sites.stateOf("site_village")?.colors.pickupB2b?.hex).toBe("#16a34a");
  });

  it("retire une couleur posée et le journal le dit (Hugo, 2026-10-13)", async () => {
    const sites = new InMemorySites(
      storedSite("site_village", {
        colors: {
          pickupB2b: SiteColor.of("#facc15"),
          pickupB2c: null,
          deliveryB2b: null,
          deliveryB2c: null,
        },
      }),
    );
    const events = await paint(sites, NO_COLORS);
    expect(sites.stateOf("site_village")?.colors.pickupB2b).toBeNull();
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      pickupColorB2b: null,
      removed: ["pickupColorB2b"],
    });
  });
});

describe("Plus de site par défaut (Hugo, 2026-10-15)", () => {
  it("créer des sites n'en désigne aucun, le premier compris", async () => {
    const sites = new InMemorySites();
    const create = new CreatePickupAddressHandler(
      sites,
      new FixedIdGenerator(),
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    );
    const payload = {
      label: "Fournil",
      ligne1: "1 rue",
      ligne2: "",
      codePostal: "73150",
      ville: "Val",
      pays: "France",
      discounts: { b2b: null, b2c: null },
      opening: { publicOpening: null, proPickup: null },
    };

    const first = await create.execute(new CreatePickupAddressCommand(payload));
    await create.execute(new CreatePickupAddressCommand(payload));

    expect(first).toBe("site_id_000001");
    // Un seul `save` par création : plus de démission d'un ancien défaut.
    expect(sites.saved).toEqual(["site_id_000001", "site_id_000002"]);
    expect(Object.keys(sites.stateOf(first) ?? {})).not.toContain("isDefault");
  });
});

describe("RemovePickupAddressHandler — supprimer archive", () => {
  const clock = new FixedClock(new Date(0));

  it("archive à l'instant de l'horloge, et la ligne reste", async () => {
    const sites = twoSites();

    await new RemovePickupAddressHandler(
      sites,
      clock,
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    ).execute(new RemovePickupAddressCommand("site_village"));

    expect(sites.stateOf("site_village")?.archivedAt).toBe(clock.now());
  });

  /** Le premier site créé n'est plus « le défaut » : il s'archive comme un autre. */
  it("archive le premier site créé", async () => {
    const sites = twoSites();

    await new RemovePickupAddressHandler(
      sites,
      clock,
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    ).execute(new RemovePickupAddressCommand("site_bakery"));

    expect(sites.stateOf("site_bakery")?.archivedAt).toBe(clock.now());
  });
});

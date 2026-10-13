import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { CreatePickupAddressCommand } from "../../../pickup-addresses/application/create-pickup-address.command.js";
import { CreatePickupAddressHandler } from "../../../pickup-addresses/application/create-pickup-address.handler.js";
import { RemovePickupAddressCommand } from "../../../pickup-addresses/application/remove-pickup-address.command.js";
import { RemovePickupAddressHandler } from "../../../pickup-addresses/application/remove-pickup-address.handler.js";
import { SetDefaultPickupAddressCommand } from "../../../pickup-addresses/application/set-default-pickup-address.command.js";
import { SetDefaultPickupAddressHandler } from "../../../pickup-addresses/application/set-default-pickup-address.handler.js";
import { PickupAddressNotFoundError } from "../../../pickup-addresses/domain/pickup-errors.js";
import { SiteColor } from "../../domain/site-color.js";
import {
  DefaultSiteArchiveError,
  SiteColorErasedError,
  SiteColorReservedError,
  SiteTransferWithoutHandoverError,
} from "../../domain/site-errors.js";
import { SetSiteColorsCommand } from "../set-site-colors.command.js";
import { SetSiteColorsHandler } from "../set-site-colors.handler.js";
import { SetSiteRolesCommand } from "../set-site-roles.command.js";
import { SetSiteRolesHandler } from "../set-site-roles.handler.js";
import { InMemorySites, storedSite } from "./site-doubles.js";

const ROLES = {
  handsOver: true,
  supply: "transfer",
  dispatches: false,
  transferMode: "integrated",
  counterSetupMinutes: 15,
} as const;

const NO_COLORS = {
  pickupColorB2b: null,
  pickupColorB2c: null,
  deliveryColorB2b: null,
  deliveryColorB2c: null,
} as const;

/** Le fournil (défaut) et le village, en base. */
function twoSites(): InMemorySites {
  return new InMemorySites(
    storedSite("site_bakery", { isDefault: true }),
    storedSite("site_village"),
  );
}

describe("SetSiteRolesHandler", () => {
  it("enregistre les rôles et les journalise", async () => {
    const sites = twoSites();
    const events = new RecordingPublisher();

    await new SetSiteRolesHandler(sites, events, new DirectUnitOfWork()).execute(
      new SetSiteRolesCommand("site_village", ROLES),
    );

    expect(sites.stateOf("site_village")?.roles).toEqual(ROLES);
    expect(events.factTypes()).toEqual(["pickup_address.roles_set"]);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      subjectLabel: "Laboratoire",
      supply: "transfer",
      counterSetupMinutes: 15,
    });
  });

  it("refuse des rôles incohérents sans rien écrire ni journaliser", async () => {
    const sites = twoSites();
    const events = new RecordingPublisher();

    await expect(
      new SetSiteRolesHandler(sites, events, new DirectUnitOfWork()).execute(
        new SetSiteRolesCommand("site_village", { ...ROLES, handsOver: false }),
      ),
    ).rejects.toBeInstanceOf(SiteTransferWithoutHandoverError);
    expect(sites.saved).toEqual([]);
    expect(events.traced).toHaveLength(0);
  });

  it("un site inconnu est un 404", async () => {
    await expect(
      new SetSiteRolesHandler(twoSites(), new RecordingPublisher(), new DirectUnitOfWork()).execute(
        new SetSiteRolesCommand("site_absent", ROLES),
      ),
    ).rejects.toBeInstanceOf(PickupAddressNotFoundError);
  });
});

describe("SetSiteColorsHandler", () => {
  function paint(sites: InMemorySites, colors: typeof NO_COLORS | Record<string, string | null>) {
    return new SetSiteColorsHandler(
      sites,
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    ).execute(new SetSiteColorsCommand("site_village", { ...NO_COLORS, ...colors }));
  }

  it("normalise en minuscules et enregistre", async () => {
    const sites = twoSites();
    await paint(sites, { pickupColorB2c: "#9CA3AF" });
    expect(sites.stateOf("site_village")?.colors.pickupB2c?.hex).toBe("#9ca3af");
  });

  it("refuse le vert des surligneurs avant de charger le site", async () => {
    const sites = twoSites();
    await expect(paint(sites, { pickupColorB2b: "#16a34a" })).rejects.toBeInstanceOf(
      SiteColorReservedError,
    );
    expect(sites.saved).toEqual([]);
  });

  it("refuse d'effacer une couleur posée", async () => {
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
    await expect(paint(sites, NO_COLORS)).rejects.toBeInstanceOf(SiteColorErasedError);
  });
});

describe("Le défaut — un seul, et il passe de main en main", () => {
  it("désigner un site démet l'ancien défaut, écrit en premier", async () => {
    const sites = twoSites();

    await new SetDefaultPickupAddressHandler(
      sites,
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    ).execute(new SetDefaultPickupAddressCommand("site_village"));

    expect(sites.stateOf("site_village")?.isDefault).toBe(true);
    expect(sites.stateOf("site_bakery")?.isDefault).toBe(false);
    expect(sites.saved).toEqual(["site_bakery", "site_village"]);
  });

  it("le premier site créé devient le défaut ; le suivant non", async () => {
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
      isDefault: false,
      discount: null,
      discountAudiences: { b2b: true, b2c: true },
      opening: { publicOpening: null, proPickup: null },
    };

    const first = await create.execute(new CreatePickupAddressCommand(payload));
    const second = await create.execute(new CreatePickupAddressCommand(payload));

    expect(first).toBe("site_id_000001");
    expect(sites.stateOf(first)?.isDefault).toBe(true);
    expect(sites.stateOf(second)?.isDefault).toBe(false);
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

  /** Remplace « le dernier point ne se supprime pas » : il est forcément le défaut. */
  it("refuse d'archiver le défaut", async () => {
    await expect(
      new RemovePickupAddressHandler(
        twoSites(),
        clock,
        new RecordingPublisher(),
        new DirectUnitOfWork(),
      ).execute(new RemovePickupAddressCommand("site_bakery")),
    ).rejects.toBeInstanceOf(DefaultSiteArchiveError);
  });
});

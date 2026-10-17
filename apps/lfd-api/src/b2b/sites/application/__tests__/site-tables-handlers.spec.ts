import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { PickupAddressNotFoundError } from "../../../pickup-addresses/domain/pickup-errors.js";
import {
  EatInSiteWithTablesError,
  SiteTableNotFoundError,
  SiteTablesWithoutEatInError,
} from "../../domain/site-errors.js";
import { SiteTables } from "../../domain/site-tables.js";
import { GenerateSiteTableQrCommand } from "../generate-site-table-qr.command.js";
import { GenerateSiteTableQrHandler } from "../generate-site-table-qr.handler.js";
import { RemoveSiteTableQrCommand } from "../remove-site-table-qr.command.js";
import { RemoveSiteTableQrHandler } from "../remove-site-table-qr.handler.js";
import { SetSiteRolesCommand } from "../set-site-roles.command.js";
import { SetSiteRolesHandler } from "../set-site-roles.handler.js";
import { SetSiteTableCountCommand } from "../set-site-table-count.command.js";
import { SetSiteTableCountHandler } from "../set-site-table-count.handler.js";
import {
  FixedDepartureSite,
  InMemorySites,
  InMemorySiteTables,
  storedSite,
} from "./site-doubles.js";

/** Les rôles d'un site neuf, salle ouverte ou non. */
function rolesWith(eatIn: boolean) {
  const fresh = storedSite("x").snapshot().roles;
  return { ...fresh, eatIn };
}

function eatInSite(): InMemorySites {
  return new InMemorySites(storedSite("site_village", { roles: rolesWith(true) }));
}

/** Une grille déjà enregistrée de `count` tables. */
function gridOf(count: number): InMemorySiteTables {
  const grid = SiteTables.empty("site_village");
  grid.setCount(count, storedSite("site_village", { roles: rolesWith(true) }));
  return new InMemorySiteTables(grid);
}

/** Une date comparée à aucune horloge : seulement recopiée en base. */
const NOW = new Date(0);

describe("SetSiteTableCountHandler", () => {
  it("pose la grille et journalise le nombre avant et après", async () => {
    const tables = new InMemorySiteTables();
    const events = new RecordingPublisher();
    await new SetSiteTableCountHandler(eatInSite(), tables, events, new DirectUnitOfWork()).execute(
      new SetSiteTableCountCommand("site_village", 4),
    );
    expect(tables.stateOf("site_village")?.tables).toHaveLength(4);
    expect(events.factTypes()).toEqual(["pickup_address.tables_set"]);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({ count: 4, before: 0 });
  });

  it("n'écrit ni ne journalise un nombre inchangé", async () => {
    const tables = gridOf(2);
    const events = new RecordingPublisher();
    await new SetSiteTableCountHandler(eatInSite(), tables, events, new DirectUnitOfWork()).execute(
      new SetSiteTableCountCommand("site_village", 2),
    );
    expect(tables.saved).toEqual([]);
    expect(events.factTypes()).toEqual([]);
  });

  it("refuse des tables sur un site sans « Sur place », sans rien écrire", async () => {
    const tables = new InMemorySiteTables();
    await expect(
      new SetSiteTableCountHandler(
        new InMemorySites(storedSite("site_village")),
        tables,
        new RecordingPublisher(),
        new DirectUnitOfWork(),
      ).execute(new SetSiteTableCountCommand("site_village", 1)),
    ).rejects.toBeInstanceOf(SiteTablesWithoutEatInError);
    expect(tables.saved).toEqual([]);
  });

  it("répond 404 pour un site inconnu", async () => {
    await expect(
      new SetSiteTableCountHandler(
        new InMemorySites(),
        new InMemorySiteTables(),
        new RecordingPublisher(),
        new DirectUnitOfWork(),
      ).execute(new SetSiteTableCountCommand("ghost", 1)),
    ).rejects.toBeInstanceOf(PickupAddressNotFoundError);
  });
});

describe("GenerateSiteTableQrHandler / RemoveSiteTableQrHandler", () => {
  function generator(tables: InMemorySiteTables, events: RecordingPublisher) {
    return new GenerateSiteTableQrHandler(
      eatInSite(),
      tables,
      new FixedIdGenerator("tok"),
      new FixedClock(NOW),
      events,
      new DirectUnitOfWork(),
    );
  }

  it("tire le jeton du port d'identifiants, date le QR, journalise le NUMÉRO seul", async () => {
    const tables = gridOf(2);
    const events = new RecordingPublisher();
    await generator(tables, events).execute(new GenerateSiteTableQrCommand("site_village", 2));
    expect(tables.stateOf("site_village")?.tables[1]).toEqual({
      number: 2,
      token: "tok_000001",
      qrCreatedAt: NOW,
    });
    expect(events.factTypes()).toEqual(["pickup_address.table_qr_generated"]);
    const payload = events.traced[0]?.journalFact().payload;
    expect(payload).toMatchObject({ table: 2 });
    expect(JSON.stringify(payload)).not.toContain("tok_");
  });

  it("refuse une table qui n'existe pas", async () => {
    const tables = gridOf(1);
    await expect(
      generator(tables, new RecordingPublisher()).execute(
        new GenerateSiteTableQrCommand("site_village", 5),
      ),
    ).rejects.toBeInstanceOf(SiteTableNotFoundError);
    expect(tables.saved).toEqual([]);
  });

  it("retire le QR et le journalise", async () => {
    const tables = gridOf(1);
    await generator(tables, new RecordingPublisher()).execute(
      new GenerateSiteTableQrCommand("site_village", 1),
    );
    const events = new RecordingPublisher();
    await new RemoveSiteTableQrHandler(eatInSite(), tables, events, new DirectUnitOfWork()).execute(
      new RemoveSiteTableQrCommand("site_village", 1),
    );
    expect(tables.stateOf("site_village")?.tables[0]).toEqual({
      number: 1,
      token: null,
      qrCreatedAt: null,
    });
    expect(events.factTypes()).toEqual(["pickup_address.table_qr_removed"]);
  });
});

describe("SetSiteRolesHandler — la case « Sur place »", () => {
  const PAYLOAD = {
    pickup: true,
    supply: "on_site",
    deliveryDeparture: false,
    transferMode: "integrated",
    counterSetupMinutes: 0,
  } as const;

  function handler(
    sites: InMemorySites,
    tables: InMemorySiteTables,
    events = new RecordingPublisher(),
  ) {
    return new SetSiteRolesHandler(
      sites,
      events,
      new DirectUnitOfWork(),
      new FixedDepartureSite(),
      tables,
    );
  }

  it("ouvre la salle et la journalise", async () => {
    const sites = new InMemorySites(storedSite("site_village"));
    const events = new RecordingPublisher();
    await handler(sites, new InMemorySiteTables(), events).execute(
      new SetSiteRolesCommand("site_village", { ...PAYLOAD, eatIn: true }),
    );
    expect(sites.stateOf("site_village")?.roles.eatIn).toBe(true);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({ eatIn: true });
  });

  it("garde la salle quand la charge n'envoie pas la case (absent = inchangé)", async () => {
    const sites = eatInSite();
    await handler(sites, new InMemorySiteTables()).execute(
      new SetSiteRolesCommand("site_village", PAYLOAD),
    );
    expect(sites.stateOf("site_village")?.roles.eatIn).toBe(true);
  });

  it("refuse de fermer une salle qui a des tables", async () => {
    const sites = eatInSite();
    await expect(
      handler(sites, gridOf(2)).execute(
        new SetSiteRolesCommand("site_village", { ...PAYLOAD, eatIn: false }),
      ),
    ).rejects.toBeInstanceOf(EatInSiteWithTablesError);
    expect(sites.saved).toEqual([]);
  });
});

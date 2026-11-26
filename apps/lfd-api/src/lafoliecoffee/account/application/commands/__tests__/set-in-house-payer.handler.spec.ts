import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { InHouseBillingNeighbours } from "../../../domain/ports/in-house-billing-neighbours.reader.js";
import type { Company } from "../../../domain/entities/company.js";
import { principalCompany } from "../../../domain/entities/__tests__/company-hierarchy-fixtures.js";
import { CompanyNotFoundError } from "../../../domain/errors/account-errors.js";
import {
  InHouseAcrossBillingFollowError,
  InHousePublicPayerError,
} from "../../../domain/errors/in-house-payer-errors.js";
import { SetInHousePayerCommand } from "../set-in-house-payer.command.js";
import { SetInHousePayerHandler } from "../set-in-house-payer.handler.js";
import { CallLog, InMemoryCompanies, RecordingHierarchyLock } from "./hierarchy-doubles.js";
import { FixedInHouseNeighbours, InMemoryInHousePayers } from "./in-house-doubles.js";

/** L'instant de la requête : il n'est comparé qu'à ce que le dépôt garde. */
const NOW = new Date("2030-03-01T08:00:00.000Z");

interface Scene {
  readonly handler: SetInHousePayerHandler;
  readonly payers: InMemoryInHousePayers;
  readonly events: RecordingPublisher;
  readonly log: CallLog;
}

function scene(
  company: Company = principalCompany(),
  neighbours: InHouseBillingNeighbours = { principalInHouse: null, sitesInHouse: [] },
): Scene {
  const log = new CallLog();
  const payers = new InMemoryInHousePayers();
  const events = new RecordingPublisher();
  const handler = new SetInHousePayerHandler(
    new InMemoryCompanies(log, new Map([[company.id ?? "", company]])),
    payers,
    new FixedInHouseNeighbours(neighbours),
    new RecordingHierarchyLock(log),
    events,
    new FixedClock(NOW),
    new DirectUnitOfWork(),
    inMemoryIntents(),
    new FixedIdGenerator("period"),
  );
  return { handler, payers, events, log };
}

function publicCompany(): Company {
  return principalCompany("active", false, "public_local_authority");
}

describe("SetInHousePayerHandler — marquer / démarquer un restaurant maison", () => {
  it("marque sous le verrou, écrit l'auteur et l'instant, journalise une fois", async () => {
    const s = scene();

    await s.handler.execute(new SetInHousePayerCommand("groupe", "staff_1", true, "k1"));

    expect(s.log.calls[0]).toBe("lock");
    expect(s.payers.liveOf("groupe")).toMatchObject({ declaredAt: NOW, declaredBy: "staff_1" });
    expect(s.events.factTypes()).toEqual(["company.in_house_declared"]);
  });

  it("rejoué avec la même clé, n'écrit ni ne journalise une seconde fois", async () => {
    const s = scene();
    const command = new SetInHousePayerCommand("groupe", "staff_1", true, "k1");

    await s.handler.execute(command);
    await s.handler.execute(command);

    expect(s.payers.saves).toBe(1);
    expect(s.events.factTypes()).toEqual(["company.in_house_declared"]);
  });

  it("marquer ce qui l'est déjà, sous une clé neuve, n'écrit rien", async () => {
    const s = scene();

    await s.handler.execute(new SetInHousePayerCommand("groupe", "staff_1", true, "k1"));
    await s.handler.execute(new SetInHousePayerCommand("groupe", "staff_2", true, "k2"));

    expect(s.payers.saves).toBe(1);
    expect(s.payers.liveOf("groupe")?.declaredBy).toBe("staff_1");
  });

  it("démarque en closant la période, garde l'historique, journalise le retrait", async () => {
    const s = scene();
    await s.handler.execute(new SetInHousePayerCommand("groupe", "staff_1", true, "k1"));

    await s.handler.execute(new SetInHousePayerCommand("groupe", "staff_2", false, "k2"));

    expect(s.payers.liveOf("groupe")).toBeUndefined();
    expect(s.payers.periods).toEqual([
      expect.objectContaining({ withdrawnAt: NOW, withdrawnBy: "staff_2" }),
    ]);
    expect(s.events.factTypes()).toEqual([
      "company.in_house_declared",
      "company.in_house_withdrawn",
    ]);
  });

  it("refuse un organisme public, sans rien écrire", async () => {
    const s = scene(publicCompany());

    await expect(
      s.handler.execute(new SetInHousePayerCommand("groupe", "staff_1", true, "k1")),
    ).rejects.toThrow(InHousePublicPayerError);
    expect(s.payers.saves).toBe(0);
    expect(s.events.factTypes()).toEqual([]);
  });

  it("refuse quand un site suit la facturation sans être maison", async () => {
    const s = scene(principalCompany(), { principalInHouse: null, sitesInHouse: [false] });

    await expect(
      s.handler.execute(new SetInHousePayerCommand("groupe", "staff_1", true, "k1")),
    ).rejects.toThrow(InHouseAcrossBillingFollowError);
    expect(s.payers.saves).toBe(0);
  });

  it("une société inconnue : 404 nommé", async () => {
    const s = scene();

    await expect(
      s.handler.execute(new SetInHousePayerCommand("absente", "staff_1", true, "k1")),
    ).rejects.toThrow(CompanyNotFoundError);
  });

  it("remarquer ouvre une période neuve, l'ancienne reste close", async () => {
    const s = scene();
    await s.handler.execute(new SetInHousePayerCommand("groupe", "staff_1", true, "k1"));
    await s.handler.execute(new SetInHousePayerCommand("groupe", "staff_1", false, "k2"));

    await s.handler.execute(new SetInHousePayerCommand("groupe", "staff_1", true, "k3"));

    expect(s.payers.periods).toHaveLength(2);
    expect(s.payers.periods.filter((period) => period.withdrawnAt === null)).toHaveLength(1);
  });
});

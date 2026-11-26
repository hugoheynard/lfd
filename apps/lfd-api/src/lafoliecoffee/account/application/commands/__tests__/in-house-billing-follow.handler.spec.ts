import type { CreateSubAccountPayload } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  chaletCompany,
  principalCompany,
} from "../../../domain/entities/__tests__/company-hierarchy-fixtures.js";
import { BillingFollowAcrossInHouseError } from "../../../domain/errors/in-house-payer-errors.js";
import { CreateSubAccountCommand } from "../create-sub-account.command.js";
import { CreateSubAccountHandler } from "../create-sub-account.handler.js";
import { FollowParentCommand } from "../follow-parent.command.js";
import { FollowParentHandler } from "../follow-parent.handler.js";
import {
  CallLog,
  InMemoryAddresses,
  InMemoryCompanies,
  InMemoryFollows,
  KnownStaff,
  RecordingHierarchyLock,
  RecordingPricingJournal,
} from "./hierarchy-doubles.js";
import { KnownInHousePayers } from "./in-house-doubles.js";
import { DELIVERY } from "./member-acts-doubles.js";

/** Les périodes s'ouvrent à l'instant de la requête ; aucune date n'est comparée au calendrier. */
const clock = new FixedClock(new Date("2030-03-01T08:00:00.000Z"));

function world(): { companies: InMemoryCompanies; follows: InMemoryFollows; log: CallLog } {
  const log = new CallLog();
  return {
    log,
    companies: new InMemoryCompanies(
      log,
      new Map([
        ["groupe", principalCompany()],
        ["chalet", chaletCompany()],
      ]),
    ),
    follows: new InMemoryFollows(log, new Map()),
  };
}

function follow(inHouse: readonly string[]): {
  handler: FollowParentHandler;
  follows: InMemoryFollows;
} {
  const w = world();
  const handler = new FollowParentHandler(
    w.companies,
    w.follows,
    new RecordingHierarchyLock(w.log),
    new RecordingPublisher(),
    clock,
    new DirectUnitOfWork(),
    new RecordingPricingJournal(),
    new KnownInHousePayers(inHouse),
  );
  return { handler, follows: w.follows };
}

describe("Suivre la facturation d'un principal — même nature maison (D3)", () => {
  it("refuse un site non maison sous un principal maison, sans rien écrire", async () => {
    const { handler, follows } = follow(["groupe"]);

    await expect(handler.execute(new FollowParentCommand("chalet", "billing"))).rejects.toThrow(
      BillingFollowAcrossInHouseError,
    );
    expect(follows.saved).toEqual([]);
  });

  it("admet deux comptes maison", async () => {
    const { handler, follows } = follow(["groupe", "chalet"]);

    await handler.execute(new FollowParentCommand("chalet", "billing"));

    expect(follows.saved).toHaveLength(1);
  });

  it("un autre aspect ne lit pas la nature maison", async () => {
    const { handler, follows } = follow(["groupe"]);

    await handler.execute(new FollowParentCommand("chalet", "contacts"));

    expect(follows.saved).toHaveLength(1);
  });

  it("un site neuf ne suit pas la facturation d'un principal maison", async () => {
    const w = world();
    const handler = new CreateSubAccountHandler(
      w.companies,
      new InMemoryAddresses(),
      w.follows,
      new RecordingHierarchyLock(w.log),
      new RecordingPublisher(),
      new FixedIdGenerator("addr"),
      clock,
      new DirectUnitOfWork(),
      new RecordingPricingJournal(),
      inMemoryIntents(),
      new KnownStaff(),
      new KnownInHousePayers(["groupe"]),
    );
    const payload: CreateSubAccountPayload = {
      raisonSociale: "",
      enseigne: "Chalet Edelweiss",
      formeJuridique: "",
      siret: "",
      siren: "",
      vatNumber: "",
      deliveryAddress: DELIVERY,
      follows: ["billing"],
    };

    await expect(
      handler.execute(new CreateSubAccountCommand("groupe", payload, false, "staff_1", "k1")),
    ).rejects.toThrow(BillingFollowAcrossInHouseError);
    expect(w.follows.saved).toEqual([]);
  });
});

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { Company } from "../../../domain/entities/company.js";
import { SubAccountFollows } from "../../../domain/entities/sub-account-follows.js";
import {
  chaletCompany,
  principalCompany,
} from "../../../domain/entities/__tests__/company-hierarchy-fixtures.js";
import { CreateSubAccountCommand } from "../create-sub-account.command.js";
import { CreateSubAccountHandler } from "../create-sub-account.handler.js";
import { DetachFromParentCommand } from "../detach-from-parent.command.js";
import { DetachFromParentHandler } from "../detach-from-parent.handler.js";
import { FollowParentCommand } from "../follow-parent.command.js";
import { FollowParentHandler } from "../follow-parent.handler.js";
import { StopFollowingParentCommand } from "../stop-following-parent.command.js";
import { StopFollowingParentHandler } from "../stop-following-parent.handler.js";
import { DELIVERY } from "./member-acts-doubles.js";
import {
  CallLog,
  InMemoryAddresses,
  InMemoryCompanies,
  InMemoryFollows,
  RecordingHierarchyLock,
  RecordingPricingJournal,
  RecordingSiteMandates,
} from "./hierarchy-doubles.js";

/**
 * **Le suivi du tarif va au journal des prix** (`plan-sous-comptes.md`, S3) :
 * les quatre gestes qui ouvrent ou ferment une période `pricing` l'inscrivent
 * par le port, et n'émettent plus `company.parent_followed/unfollowed` pour
 * cet aspect — la copie générale de l'acte de prix en tient lieu.
 */
const clock = new FixedClock(new Date("2030-03-01T08:00:00.000Z"));
const EARLIER = new Date(clock.now().getTime() - 60_000);
const CHILD = { id: "chalet", name: "Chalet Edelweiss" };
const PARENT = { id: "groupe", name: "Alpes Chalets" };

function world(companies: readonly Company[], follows: readonly SubAccountFollows[] = []) {
  const log = new CallLog();
  return {
    companies: new InMemoryCompanies(log, new Map(companies.map((c) => [c.id ?? "", c]))),
    follows: new InMemoryFollows(log, new Map(follows.map((f) => [f.companyId, f]))),
    lock: new RecordingHierarchyLock(log),
    events: new RecordingPublisher(),
    pricing: new RecordingPricingJournal(),
    mandates: new RecordingSiteMandates(log),
  };
}
type World = ReturnType<typeof world>;

function followingPricing(): SubAccountFollows {
  const follows = SubAccountFollows.none("chalet");
  follows.follow("pricing", chaletCompany(), principalCompany(), EARLIER);
  return follows;
}

function follow(w: World) {
  return new FollowParentHandler(
    w.companies,
    w.follows,
    w.lock,
    w.events,
    clock,
    new DirectUnitOfWork(),
    w.pricing,
  );
}

function stop(w: World) {
  return new StopFollowingParentHandler(
    w.companies,
    w.follows,
    w.lock,
    w.events,
    clock,
    new DirectUnitOfWork(),
    w.pricing,
    w.mandates,
  );
}

describe("le suivi du tarif, au journal des prix", () => {
  it("suivre `pricing` l'inscrit au journal des prix, pas au fait général du compte", async () => {
    const w = world([principalCompany(), chaletCompany()]);

    await follow(w).execute(new FollowParentCommand("chalet", "pricing"));

    expect(w.pricing.started).toEqual([{ child: CHILD, parent: PARENT, validFrom: clock.now() }]);
    expect(w.events.factTypes()).toEqual([]);
  });

  it("cesser de suivre `pricing` cite le début et la fin de la période", async () => {
    const w = world([principalCompany(), chaletCompany()], [followingPricing()]);

    await stop(w).execute(new StopFollowingParentCommand("chalet", "pricing"));

    expect(w.pricing.ended).toEqual([
      { child: CHILD, parent: PARENT, validFrom: EARLIER, validTo: clock.now() },
    ]);
    expect(w.events.factTypes()).toEqual([]);
  });

  it("les autres aspects gardent leur fait général et n'écrivent rien au journal des prix", async () => {
    const w = world([principalCompany(), chaletCompany()]);

    await follow(w).execute(new FollowParentCommand("chalet", "contacts"));

    expect(w.events.factTypes()).toEqual(["company.parent_followed"]);
    expect(w.pricing.started).toEqual([]);
  });

  it("créer un sous-compte qui suit `pricing` l'inscrit au journal des prix", async () => {
    const w = world([principalCompany()]);

    await new CreateSubAccountHandler(
      w.companies,
      new InMemoryAddresses(),
      w.follows,
      w.lock,
      w.events,
      new FixedIdGenerator("addr"),
      clock,
      new DirectUnitOfWork(),
      w.pricing,
    ).execute(
      new CreateSubAccountCommand(
        "groupe",
        {
          raisonSociale: "",
          enseigne: "Chalet Edelweiss",
          formeJuridique: "",
          siret: "",
          siren: "",
          vatNumber: "",
          deliveryAddress: DELIVERY,
          follows: ["pricing"],
        },
        true,
      ),
    );

    expect(w.pricing.started.map((entry) => entry.parent)).toEqual([PARENT]);
    expect(w.events.factTypes()).toEqual(["company.parent_attached"]);
  });

  it("détacher un sous-compte qui suivait `pricing` inscrit la fin de la période", async () => {
    const w = world([principalCompany(), chaletCompany()], [followingPricing()]);

    await new DetachFromParentHandler(
      w.companies,
      w.follows,
      w.lock,
      w.events,
      clock,
      new DirectUnitOfWork(),
      w.pricing,
      w.mandates,
    ).execute(new DetachFromParentCommand("chalet"));

    expect(w.pricing.ended).toEqual([
      { child: CHILD, parent: PARENT, validFrom: EARLIER, validTo: clock.now() },
    ]);
    expect(w.events.factTypes()).toEqual(["company.parent_detached"]);
  });

  it("détacher sans suivi du tarif n'écrit rien au journal des prix", async () => {
    const w = world([principalCompany(), chaletCompany()]);

    await new DetachFromParentHandler(
      w.companies,
      w.follows,
      w.lock,
      w.events,
      clock,
      new DirectUnitOfWork(),
      w.pricing,
      w.mandates,
    ).execute(new DetachFromParentCommand("chalet"));

    expect(w.pricing.ended).toEqual([]);
  });
});

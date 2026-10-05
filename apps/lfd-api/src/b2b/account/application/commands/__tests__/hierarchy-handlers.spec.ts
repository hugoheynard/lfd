import type { CreateSubAccountPayload } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { Company } from "../../../domain/entities/company.js";
import { SubAccountFollows } from "../../../domain/entities/sub-account-follows.js";
import {
  BillingFollowNeedsActiveParentError,
  ParentIsSubAccountError,
  PricingFollowNotAllowedError,
} from "../../../domain/errors/hierarchy-errors.js";
import {
  chaletCompany,
  principalCompany,
} from "../../../domain/entities/__tests__/company-hierarchy-fixtures.js";
import { AttachToParentCommand } from "../attach-to-parent.command.js";
import { AttachToParentHandler } from "../attach-to-parent.handler.js";
import { CreateSubAccountCommand } from "../create-sub-account.command.js";
import { CreateSubAccountHandler } from "../create-sub-account.handler.js";
import { DetachFromParentCommand } from "../detach-from-parent.command.js";
import { DetachFromParentHandler } from "../detach-from-parent.handler.js";
import { FollowParentCommand } from "../follow-parent.command.js";
import { FollowParentHandler } from "../follow-parent.handler.js";
import { SetGroupWithoutDeliveryCommand } from "../set-group-without-delivery.command.js";
import { SetGroupWithoutDeliveryHandler } from "../set-group-without-delivery.handler.js";
import { StopFollowingParentCommand } from "../stop-following-parent.command.js";
import { StopFollowingParentHandler } from "../stop-following-parent.handler.js";
import { DELIVERY } from "./member-acts-doubles.js";
import {
  CallLog,
  InMemoryAddresses,
  InMemoryCompanies,
  InMemoryFollows,
  RecordingHierarchyLock,
} from "./hierarchy-doubles.js";

/** L'horloge de la requête : les périodes s'ouvrent à SON instant, jamais à une date du calendrier. */
const clock = new FixedClock(new Date("2030-03-01T08:00:00.000Z"));

interface World {
  readonly log: CallLog;
  readonly companies: InMemoryCompanies;
  readonly follows: InMemoryFollows;
  readonly addresses: InMemoryAddresses;
  readonly lock: RecordingHierarchyLock;
  readonly events: RecordingPublisher;
}

function world(companies: readonly Company[], follows: readonly SubAccountFollows[] = []): World {
  const log = new CallLog();
  return {
    log,
    companies: new InMemoryCompanies(log, new Map(companies.map((c) => [c.id ?? "", c]))),
    follows: new InMemoryFollows(log, new Map(follows.map((f) => [f.companyId, f]))),
    addresses: new InMemoryAddresses(),
    lock: new RecordingHierarchyLock(log),
    events: new RecordingPublisher(),
  };
}

function payload(over: Partial<CreateSubAccountPayload> = {}): CreateSubAccountPayload {
  return {
    raisonSociale: "",
    enseigne: "Chalet Edelweiss",
    formeJuridique: "",
    siret: "",
    siren: "",
    vatNumber: "",
    deliveryAddress: DELIVERY,
    follows: [],
    ...over,
  };
}

function createHandler(w: World): CreateSubAccountHandler {
  return new CreateSubAccountHandler(
    w.companies,
    w.addresses,
    w.follows,
    w.lock,
    w.events,
    new FixedIdGenerator("addr"),
    clock,
    new DirectUnitOfWork(),
  );
}

/** Un chalet qui suit déjà la facturation et le tarif de son principal. */
function chaletFollowing(): SubAccountFollows {
  const follows = SubAccountFollows.none("chalet");
  const earlier = new Date(clock.now().getTime() - 60_000);
  follows.follow("billing", chaletCompany(), principalCompany(), earlier);
  follows.follow("pricing", chaletCompany(), principalCompany(), earlier);
  return follows;
}

describe("Créer un sous-compte", () => {
  it("prend le verrou AVANT de relire le principal, et crée lien, adresse et suivis", async () => {
    const w = world([principalCompany()]);

    const id = await createHandler(w).execute(
      new CreateSubAccountCommand("groupe", payload({ follows: ["billing", "contacts"] }), false),
    );

    expect(id).toBe("sub_new");
    expect(w.log.calls.slice(0, 3)).toEqual(["lock", "load:groupe", "declare"]);
    expect(w.companies.declared[0]?.parentCompanyId).toBe("groupe");
    expect(w.addresses.books[0]?.companyId()).toBe("sub_new");
    expect(w.follows.saved[0]?.open.map((p) => p.aspect)).toEqual(["billing", "contacts"]);
    expect(w.events.factTypes()).toEqual([
      "company.parent_attached",
      "company.parent_followed",
      "company.parent_followed",
    ]);
  });

  it("refuse le suivi du tarif sans le droit de tarification, avant toute écriture", async () => {
    const w = world([principalCompany()]);

    await expect(
      createHandler(w).execute(
        new CreateSubAccountCommand("groupe", payload({ follows: ["pricing"] }), false),
      ),
    ).rejects.toThrow(PricingFollowNotAllowedError);
    expect(w.log.calls).toEqual([]);
  });

  it("accepte le suivi du tarif avec le droit de tarification", async () => {
    const w = world([principalCompany()]);

    await createHandler(w).execute(
      new CreateSubAccountCommand("groupe", payload({ follows: ["pricing"] }), true),
    );

    expect(w.follows.saved[0]?.open.map((p) => p.aspect)).toEqual(["pricing"]);
  });

  it("refuse un principal qui est lui-même un sous-compte", async () => {
    const w = world([chaletCompany()]);

    await expect(
      createHandler(w).execute(new CreateSubAccountCommand("chalet", payload(), false)),
    ).rejects.toThrow(ParentIsSubAccountError);
    expect(w.companies.declared).toEqual([]);
  });

  it("refuse de suivre la facturation d'un principal en attente", async () => {
    const w = world([principalCompany("pending")]);

    await expect(
      createHandler(w).execute(
        new CreateSubAccountCommand("groupe", payload({ follows: ["billing"] }), false),
      ),
    ).rejects.toThrow(BillingFollowNeedsActiveParentError);
  });
});

describe("Rattacher et détacher", () => {
  it("rattache sous le verrou, et journalise", async () => {
    const w = world([principalCompany(), chaletCompany(null)]);

    await new AttachToParentHandler(w.companies, w.lock, w.events, new DirectUnitOfWork()).execute(
      new AttachToParentCommand("chalet", "groupe"),
    );

    expect(w.log.calls[0]).toBe("lock");
    expect(w.companies.saved[0]?.parentCompanyId).toBe("groupe");
    expect(w.events.factTypes()).toEqual(["company.parent_attached"]);
  });

  it("rattacher au principal qu'on a déjà ne change rien et ne s'inscrit pas", async () => {
    const w = world([principalCompany(), chaletCompany()]);

    await new AttachToParentHandler(w.companies, w.lock, w.events, new DirectUnitOfWork()).execute(
      new AttachToParentCommand("chalet", "groupe"),
    );

    expect(w.companies.saved).toEqual([]);
    expect(w.events.factTypes()).toEqual([]);
  });

  it("détacher ferme les suivis AVANT de retirer le lien", async () => {
    const w = world([principalCompany(), chaletCompany()], [chaletFollowing()]);

    await new DetachFromParentHandler(
      w.companies,
      w.follows,
      w.lock,
      w.events,
      clock,
      new DirectUnitOfWork(),
    ).execute(new DetachFromParentCommand("chalet"));

    const order = w.log.calls.filter((call) => call.startsWith("save"));
    expect(order).toEqual(["saveFollows:chalet", "save:chalet"]);
    expect(w.follows.saved[0]?.open).toEqual([]);
    expect(w.companies.saved[0]?.parentCompanyId).toBeNull();
    const fact = w.events.traced[0]?.journalFact();
    expect(fact?.type).toBe("company.parent_detached");
    expect(fact?.payload["closedAspects"]).toEqual(["billing", "pricing"]);
  });
});

describe("Suivre et cesser de suivre", () => {
  function followHandler(w: World): FollowParentHandler {
    return new FollowParentHandler(
      w.companies,
      w.follows,
      w.lock,
      w.events,
      clock,
      new DirectUnitOfWork(),
    );
  }
  function stopHandler(w: World): StopFollowingParentHandler {
    return new StopFollowingParentHandler(
      w.companies,
      w.follows,
      w.lock,
      w.events,
      clock,
      new DirectUnitOfWork(),
    );
  }

  it("ouvre la période à l'instant de la requête", async () => {
    const w = world([principalCompany(), chaletCompany()]);

    await followHandler(w).execute(new FollowParentCommand("chalet", "contacts"));

    expect(w.log.calls[0]).toBe("lock");
    expect(w.follows.saved[0]?.followsAt("contacts", clock.now())?.validFrom).toEqual(clock.now());
    expect(w.events.factTypes()).toEqual(["company.parent_followed"]);
  });

  it("suivre ce qu'on suit déjà ne s'inscrit pas", async () => {
    const w = world([principalCompany(), chaletCompany()], [chaletFollowing()]);

    await followHandler(w).execute(new FollowParentCommand("chalet", "billing"));

    expect(w.follows.saved).toEqual([]);
    expect(w.events.factTypes()).toEqual([]);
  });

  it("cesser de suivre ferme la période et cite le principal d'alors", async () => {
    const w = world([principalCompany(), chaletCompany()], [chaletFollowing()]);

    await stopHandler(w).execute(new StopFollowingParentCommand("chalet", "billing"));

    expect(w.follows.saved[0]?.followsAt("billing", clock.now())).toBeNull();
    const fact = w.events.traced[0]?.journalFact();
    expect(fact?.type).toBe("company.parent_unfollowed");
    expect(fact?.payload["parent"]).toEqual({ id: "groupe", name: "Alpes Chalets" });
  });

  it("cesser de suivre ce qu'on ne suit pas ne s'inscrit pas", async () => {
    const w = world([principalCompany(), chaletCompany()]);

    await stopHandler(w).execute(new StopFollowingParentCommand("chalet", "pricing"));

    expect(w.events.factTypes()).toEqual([]);
  });
});

describe("Compte de groupe, sans livraison", () => {
  it("coche la case sur un principal, et ne réinscrit pas la même valeur", async () => {
    const w = world([principalCompany()]);
    const handler = new SetGroupWithoutDeliveryHandler(
      w.companies,
      w.lock,
      w.events,
      new DirectUnitOfWork(),
    );

    await handler.execute(new SetGroupWithoutDeliveryCommand("groupe", true));
    await handler.execute(new SetGroupWithoutDeliveryCommand("groupe", true));

    expect(w.events.factTypes()).toEqual(["company.group_without_delivery_set"]);
  });
});

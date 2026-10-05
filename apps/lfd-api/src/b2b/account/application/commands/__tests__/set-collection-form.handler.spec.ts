import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { Company } from "../../../domain/entities/company.js";
import { SubAccountFollows } from "../../../domain/entities/sub-account-follows.js";
import { CollectionFormNeedsBillingFollowError } from "../../../domain/errors/collection-form-errors.js";
import {
  chaletCompany,
  principalCompany,
} from "../../../domain/entities/__tests__/company-hierarchy-fixtures.js";
import { SetCollectionFormCommand } from "../set-collection-form.command.js";
import { SetCollectionFormHandler } from "../set-collection-form.handler.js";
import {
  CallLog,
  InMemoryCollectionForms,
  InMemoryCompanies,
  InMemoryFollows,
  RecordingHierarchyLock,
} from "./hierarchy-doubles.js";

/** L'horloge de la requête : la forme s'ouvre à SON instant. */
const clock = new FixedClock(new Date("2030-03-01T08:00:00.000Z"));

function world(follows: readonly SubAccountFollows[]) {
  const log = new CallLog();
  const companies: readonly Company[] = [principalCompany(), chaletCompany()];
  const forms = new InMemoryCollectionForms();
  const events = new RecordingPublisher();
  const handler = new SetCollectionFormHandler(
    new InMemoryCompanies(log, new Map(companies.map((c) => [c.id ?? "", c]))),
    new InMemoryFollows(log, new Map(follows.map((f) => [f.companyId, f]))),
    forms,
    new RecordingHierarchyLock(log),
    clock,
    new DirectUnitOfWork(),
    events,
  );
  return { log, forms, events, handler };
}

function billingFollowed(): SubAccountFollows {
  const follows = SubAccountFollows.none("chalet");
  follows.follow(
    "billing",
    chaletCompany(),
    principalCompany(),
    new Date(clock.now().getTime() - 60_000),
  );
  return follows;
}

describe("SetCollectionFormHandler — la forme de prélèvement d'un site (§2.1 ter)", () => {
  it("prend le verrou de la hiérarchie, puis ouvre la forme à l'instant de la requête", async () => {
    const w = world([billingFollowed()]);

    await w.handler.execute(new SetCollectionFormCommand("chalet", "own_mandate_principal_iban"));

    expect(w.log.calls[0]).toBe("lock");
    expect(w.forms.saved[0]?.formAt(clock.now())).toBe("own_mandate_principal_iban");
    const fact = w.events.traced[0]?.journalFact();
    expect(fact?.type).toBe("company.collection_form_set");
    expect(fact?.payload["form"]).toBe("own_mandate_principal_iban");
    expect(fact?.payload["since"]).toBe(clock.now().toISOString());
  });

  it("n'écrit rien quand la forme demandée est déjà en vigueur", async () => {
    const w = world([billingFollowed()]);

    await w.handler.execute(new SetCollectionFormCommand("chalet", "principal_mandate"));

    expect(w.forms.saved).toEqual([]);
    expect(w.events.factTypes()).toEqual([]);
  });

  it("refuse un sous-compte qui ne suit pas `billing`, sans rien écrire", async () => {
    const w = world([]);

    await expect(
      w.handler.execute(new SetCollectionFormCommand("chalet", "own_iban")),
    ).rejects.toBeInstanceOf(CollectionFormNeedsBillingFollowError);
    expect(w.forms.saved).toEqual([]);
  });
});

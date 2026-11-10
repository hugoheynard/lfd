import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { CompanyLifecycleReader } from "../../../account/domain/ports/company-lifecycle.reader.js";
import { CompanyNameReader } from "../../../account/domain/ports/company-name.reader.js";
import {
  StaffDirectory,
  type StaffIdentity,
} from "../../../account/domain/ports/staff-directory.js";
import type { CompanyStatus } from "../../../account/domain/value-objects/company-status.js";
import {
  AlreadyExemptError,
  ExemptedCompanyNotFoundError,
  OrderOpeningExemptionNotFoundError,
} from "../../domain/errors/order-opening-exemption-errors.js";
import type { OrderOpeningExemption } from "../../domain/order-opening-exemption.js";
import { ActiveOrderOpeningExemptions } from "../../domain/ports/active-order-opening-exemptions.reader.js";
import { OrderOpeningExemptionRepository } from "../../domain/ports/order-opening-exemption.repository.js";
import { GrantOrderOpeningExemptionCommand } from "../commands/grant-order-opening-exemption.command.js";
import { GrantOrderOpeningExemptionHandler } from "../commands/grant-order-opening-exemption.handler.js";
import { WithdrawOrderOpeningExemptionCommand } from "../commands/withdraw-order-opening-exemption.command.js";
import { WithdrawOrderOpeningExemptionHandler } from "../commands/withdraw-order-opening-exemption.handler.js";

const AT = new Date(0);

/** Une table en mémoire : les deux ports lisent et écrivent les mêmes agrégats. */
class Store extends OrderOpeningExemptionRepository {
  readonly rows = new Map<string, OrderOpeningExemption>();
  load(id: string): Promise<OrderOpeningExemption | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }
  save(exemption: OrderOpeningExemption): Promise<void> {
    this.rows.set(exemption.id, exemption);
    return Promise.resolve();
  }
}

class StoreActive extends ActiveOrderOpeningExemptions {
  constructor(private readonly store: Store) {
    super();
  }
  active(): Promise<readonly OrderOpeningExemption[]> {
    return Promise.resolve([...this.store.rows.values()].filter((row) => row.isActive()));
  }
}

class Names extends CompanyNameReader {
  constructor(private readonly names: Readonly<Record<string, string>>) {
    super();
  }
  nameOf(companyId: string): Promise<string | null> {
    return Promise.resolve(this.names[companyId] ?? null);
  }
}

class Lifecycles extends CompanyLifecycleReader {
  constructor(private readonly statuses: Readonly<Record<string, CompanyStatus>>) {
    super();
  }
  statusOf(companyId: string): Promise<CompanyStatus | null> {
    return Promise.resolve(this.statuses[companyId] ?? null);
  }
}

class Directory extends StaffDirectory {
  identify(): Promise<StaffIdentity | null> {
    return Promise.resolve({ name: "Colette Martin", role: "admin" });
  }
}

function grantHandler(store: Store, events: RecordingPublisher): GrantOrderOpeningExemptionHandler {
  return new GrantOrderOpeningExemptionHandler(
    new StoreActive(store),
    store,
    new Names({ c1: "Chez Paul" }),
    new Lifecycles({ c1: "active" }),
    new Directory(),
    new FixedIdGenerator("ex"),
    new FixedClock(AT),
    events,
    new DirectUnitOfWork(),
  );
}

describe("GrantOrderOpeningExemptionHandler", () => {
  it("accorde à une société, nommée et tracée, et le dit au journal", async () => {
    const store = new Store();
    const events = new RecordingPublisher();

    const id = await grantHandler(store, events).execute(
      new GrantOrderOpeningExemptionCommand({ kind: "company", companyId: "c1" }, "staff_1"),
    );

    expect(store.rows.get(id)?.label).toBe("Chez Paul");
    expect(store.rows.get(id)?.granted.author.name).toBe("Colette Martin");
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "order_opening.exemption_granted",
        subjectType: "order_opening",
        subjectId: id,
        payload: {
          subjectLabel: "Chez Paul",
          kind: "company",
          company: { id: "c1", name: "Chez Paul" },
        },
      },
    ]);
  });

  it("refuse une société inconnue sans rien écrire", async () => {
    const store = new Store();
    const events = new RecordingPublisher();

    await expect(
      grantHandler(store, events).execute(
        new GrantOrderOpeningExemptionCommand({ kind: "company", companyId: "c9" }, "staff_1"),
      ),
    ).rejects.toBeInstanceOf(ExemptedCompanyNotFoundError);
    expect(store.rows.size).toBe(0);
    expect(events.traced).toEqual([]);
  });

  it("refuse une adresse déjà exemptée", async () => {
    const store = new Store();
    const handler = grantHandler(store, new RecordingPublisher());
    await handler.execute(
      new GrantOrderOpeningExemptionCommand({ kind: "email", email: "jean@folie.fr" }, "s"),
    );

    await expect(
      handler.execute(
        new GrantOrderOpeningExemptionCommand({ kind: "email", email: " Jean@folie.fr" }, "s"),
      ),
    ).rejects.toBeInstanceOf(AlreadyExemptError);
  });
});

describe("WithdrawOrderOpeningExemptionHandler", () => {
  function withdrawHandler(
    store: Store,
    events: RecordingPublisher,
  ): WithdrawOrderOpeningExemptionHandler {
    return new WithdrawOrderOpeningExemptionHandler(
      store,
      new Directory(),
      new FixedClock(AT),
      events,
      new DirectUnitOfWork(),
    );
  }

  it("archive l'exemption au lieu de l'effacer, et le dit au journal", async () => {
    const store = new Store();
    const id = await grantHandler(store, new RecordingPublisher()).execute(
      new GrantOrderOpeningExemptionCommand({ kind: "email", email: "jean@folie.fr" }, "s"),
    );
    const events = new RecordingPublisher();

    await withdrawHandler(store, events).execute(new WithdrawOrderOpeningExemptionCommand(id, "s"));

    expect(store.rows.get(id)?.isActive()).toBe(false);
    expect(store.rows.get(id)?.withdrawn?.author.name).toBe("Colette Martin");
    expect(events.traced.map((event) => event.journalFact().type)).toEqual([
      "order_opening.exemption_withdrawn",
    ]);
  });

  it("refuse un identifiant inconnu, puis un second retrait", async () => {
    const store = new Store();
    const id = await grantHandler(store, new RecordingPublisher()).execute(
      new GrantOrderOpeningExemptionCommand({ kind: "email", email: "jean@folie.fr" }, "s"),
    );
    const handler = withdrawHandler(store, new RecordingPublisher());

    await expect(
      handler.execute(new WithdrawOrderOpeningExemptionCommand("inconnu", "s")),
    ).rejects.toBeInstanceOf(OrderOpeningExemptionNotFoundError);
    await handler.execute(new WithdrawOrderOpeningExemptionCommand(id, "s"));
    await expect(
      handler.execute(new WithdrawOrderOpeningExemptionCommand(id, "s")),
    ).rejects.toBeInstanceOf(OrderOpeningExemptionNotFoundError);
  });
});

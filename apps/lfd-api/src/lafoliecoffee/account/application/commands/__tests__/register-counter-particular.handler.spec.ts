import {
  InsideUnitOfWork,
  SealingIntentLedger,
} from "../../../../../platform/intent/__tests__/sealing-intent-ledger.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { InvalidPhoneError } from "../../../domain/errors/account-errors.js";
import { ParticularContactTakenError } from "../../../domain/errors/particular-errors.js";
import {
  ParticularRegistry,
  type ParticularHolder,
} from "../../../domain/ports/particular-registry.js";
import type { ParticularIdentity } from "../../../domain/value-objects/particular-identity.js";
import { RegisterCounterParticularCommand } from "../register-counter-particular.command.js";
import { RegisterCounterParticularHandler } from "../register-counter-particular.handler.js";

/** Un registre en mémoire : les fiches déjà là, et celles qu'on inscrit. */
class InMemoryParticularRegistry extends ParticularRegistry {
  readonly registered: { readonly identity: ParticularIdentity; readonly by: string }[] = [];

  constructor(
    private readonly existing: readonly {
      id: string;
      firstName: string;
      email: string;
      phoneKey: string;
    }[] = [],
  ) {
    super();
  }

  holderOf(identity: ParticularIdentity): Promise<ParticularHolder | null> {
    const byEmail = this.existing.find((p) => p.email === identity.email.value);
    if (byEmail !== undefined) {
      return Promise.resolve({ id: byEmail.id, firstName: byEmail.firstName, taken: "email" });
    }
    const byPhone = this.existing.find((p) => p.phoneKey === identity.phoneKey);
    return Promise.resolve(
      byPhone === undefined
        ? null
        : { id: byPhone.id, firstName: byPhone.firstName, taken: "phone" },
    );
  }

  register(identity: ParticularIdentity, registeredBy: string): Promise<string> {
    this.registered.push({ identity, by: registeredBy });
    return Promise.resolve(`u_new_${this.registered.length}`);
  }
}

const JEAN = { firstName: "Jean", email: "Jean@Gmail.com", phone: "06 12 34 56 78" };

function handlerWith(registry: ParticularRegistry): {
  handler: RegisterCounterParticularHandler;
  ledger: SealingIntentLedger;
} {
  const uow = new InsideUnitOfWork();
  const ledger = new SealingIntentLedger(() => uow.inside);
  return {
    handler: new RegisterCounterParticularHandler(registry, uow, inMemoryIntents(ledger)),
    ledger,
  };
}

describe("inscrire un particulier au comptoir", () => {
  it("inscrit une fiche neuve, auteur noté, intention scellée dans la transaction", async () => {
    const registry = new InMemoryParticularRegistry();
    const { handler, ledger } = handlerWith(registry);

    const id = await handler.execute(new RegisterCounterParticularCommand("staff_1", JEAN, "k1"));

    expect(id).toBe("u_new_1");
    expect(registry.registered.map((r) => [r.identity.email.value, r.by])).toEqual([
      ["jean@gmail.com", "staff_1"],
    ]);
    expect(ledger.resolutions).toEqual(["in tx"]);
  });

  it("rend la même fiche à un double envoi, sans en créer une seconde", async () => {
    const registry = new InMemoryParticularRegistry();
    const { handler } = handlerWith(registry);
    const command = new RegisterCounterParticularCommand("staff_1", JEAN, "k1");

    const first = await handler.execute(command);
    const second = await handler.execute(command);

    expect(second).toBe(first);
    expect(registry.registered).toHaveLength(1);
  });

  it("refuse l'adresse d'un particulier existant et nomme sa fiche, sans rien inscrire", async () => {
    const registry = new InMemoryParticularRegistry([
      { id: "u_old", firstName: "Jeanne", email: "jean@gmail.com", phoneKey: "0700000000" },
    ]);
    const { handler } = handlerWith(registry);

    const refusal = handler.execute(new RegisterCounterParticularCommand("staff_1", JEAN, "k1"));

    await expect(refusal).rejects.toBeInstanceOf(ParticularContactTakenError);
    await expect(refusal).rejects.toMatchObject({
      existingId: "u_old",
      existingFirstName: "Jeanne",
      taken: "email",
    });
    expect(registry.registered).toHaveLength(0);
  });

  it("refuse le téléphone d'un particulier existant, écrit autrement", async () => {
    const registry = new InMemoryParticularRegistry([
      { id: "u_old", firstName: "Paul", email: "paul@x.fr", phoneKey: "0612345678" },
    ]);
    const { handler } = handlerWith(registry);

    await expect(
      handler.execute(
        new RegisterCounterParticularCommand(
          "staff_1",
          { ...JEAN, phone: "+33 6 12 34 56 78" },
          "k1",
        ),
      ),
    ).rejects.toMatchObject({ existingId: "u_old", taken: "phone" });
  });

  it("refuse une saisie sans téléphone avant toute lecture", async () => {
    const registry = new InMemoryParticularRegistry();
    const { handler } = handlerWith(registry);

    await expect(
      handler.execute(
        new RegisterCounterParticularCommand("staff_1", { ...JEAN, phone: "" }, "k1"),
      ),
    ).rejects.toBeInstanceOf(InvalidPhoneError);
    expect(registry.registered).toHaveLength(0);
  });
});

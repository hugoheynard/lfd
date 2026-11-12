import { randomUUID } from "node:crypto";

import type { ContactPhonePayload } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { ContactPhone } from "../../../domain/contact-phone.js";
import { ContactPhoneRepository } from "../../../domain/ports/contact-phone.repository.js";
import { CreateContactPhoneCommand } from "../create-contact-phone.command.js";
import { CreateContactPhoneHandler } from "../create-contact-phone.handler.js";

/** Les numéros écrits, en mémoire. */
class MemoryPhones extends ContactPhoneRepository {
  readonly saved: ContactPhone[] = [];
  load(): Promise<ContactPhone | null> {
    return Promise.resolve(null);
  }
  save(phone: ContactPhone): Promise<void> {
    this.saved.push(phone);
    return Promise.resolve();
  }
}

const PHONE: ContactPhonePayload = {
  label: { fr: "Atelier", en: "Workshop", it: "Laboratorio" },
  number: "04 79 00 00 00",
  audience: "both",
  position: 0,
  active: true,
};

describe("CreateContactPhoneHandler", () => {
  /** Régression : un double clic créait deux numéros identiques. */
  it("rejouée sous la même clé, rend le même numéro sans en créer un second", async () => {
    const phones = new MemoryPhones();
    const handler = new CreateContactPhoneHandler(
      phones,
      new FixedIdGenerator("phone"),
      new FixedClock(new Date(0)),
      new DirectUnitOfWork(),
      inMemoryIntents(),
    );
    const key = randomUUID();

    const first = await handler.execute(new CreateContactPhoneCommand(PHONE, "staff_1", key));
    const replayed = await handler.execute(new CreateContactPhoneCommand(PHONE, "staff_1", key));

    expect(replayed).toBe(first);
    expect(phones.saved).toHaveLength(1);
  });

  it("une clé neuve crée un second numéro : un vrai second geste", async () => {
    const phones = new MemoryPhones();
    const handler = new CreateContactPhoneHandler(
      phones,
      new FixedIdGenerator("phone"),
      new FixedClock(new Date(0)),
      new DirectUnitOfWork(),
      inMemoryIntents(),
    );

    await handler.execute(new CreateContactPhoneCommand(PHONE, "staff_1", randomUUID()));
    await handler.execute(new CreateContactPhoneCommand(PHONE, "staff_1", randomUUID()));

    expect(phones.saved).toHaveLength(2);
  });
});

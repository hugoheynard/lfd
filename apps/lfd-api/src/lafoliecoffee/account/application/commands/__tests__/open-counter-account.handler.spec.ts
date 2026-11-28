import { randomUUID } from "node:crypto";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { Company } from "../../../domain/entities/company.js";
import { CounterAccountUnreachableError } from "../../../domain/errors/counter-account-errors.js";
import { CompanyDeclaredEvent } from "../../../domain/events/company-declared.event.js";
import { CounterOpeningAttestations } from "../../../domain/ports/counter-opening-attestations.js";
import {
  CounterPayerOpening,
  type OpenedCounterPayer,
} from "../../../domain/ports/counter-payer-opening.js";
import { StaffDirectory, type StaffIdentity } from "../../../domain/ports/staff-directory.js";
import type { IdentityAttestation } from "../../../domain/value-objects/identity-attestation.js";
import { OpenCounterAccountCommand } from "../open-counter-account.command.js";
import { OpenCounterAccountHandler } from "../open-counter-account.handler.js";
import { InMemoryCompanies } from "./member-acts-doubles.js";

const NOW = new Date("2026-08-07T09:00:00.000Z");
const CONTACT = {
  firstName: "Camille",
  lastName: "Rousseau",
  fonction: "",
  email: "camille@kiosque.test",
  phone: "06 12 34 56 78",
};

/** Garde la société déclarée, et l'ordre des écritures. */
class DeclaringCompanies extends InMemoryCompanies {
  readonly declared: Company[] = [];
  constructor(private readonly log: string[]) {
    super();
  }
  // Facultatif : le double parent se déclare sans argument, le port en prend un.
  override declareUnowned(company?: Company): Promise<string> {
    this.log.push("company");
    if (company !== undefined) {
      this.declared.push(company);
    }
    return Promise.resolve("cmp_counter");
  }
}

class RecordingAttestations extends CounterOpeningAttestations {
  readonly recorded: { companyId: string; attestation: IdentityAttestation }[] = [];
  constructor(private readonly log: string[]) {
    super();
  }
  record(companyId: string, attestation: IdentityAttestation): Promise<void> {
    this.log.push("attestation");
    this.recorded.push({ companyId, attestation });
    return Promise.resolve();
  }
}

class RecordingPayerOpening extends CounterPayerOpening {
  readonly opened: { payer: OpenedCounterPayer; at: Date; staffUserId: string }[] = [];
  constructor(private readonly log: string[]) {
    super();
  }
  open(payer: OpenedCounterPayer, at: Date, staffUserId: string): Promise<void> {
    this.log.push("transfer");
    this.opened.push({ payer, at, staffUserId });
    return Promise.resolve();
  }
}

class KnownStaff extends StaffDirectory {
  identify(): Promise<StaffIdentity | null> {
    return Promise.resolve({ name: "Léa Martin", role: "counter" });
  }
}

function world() {
  const log: string[] = [];
  const companies = new DeclaringCompanies(log);
  const attestations = new RecordingAttestations(log);
  const payers = new RecordingPayerOpening(log);
  const events = new RecordingPublisher();
  const handler = new OpenCounterAccountHandler(
    companies,
    attestations,
    payers,
    new KnownStaff(),
    events,
    inMemoryIntents(),
    new DirectUnitOfWork(),
    new FixedClock(NOW),
  );
  return { handler, log, companies, attestations, payers, events };
}

function command(identitySeen: boolean, key = randomUUID()): OpenCounterAccountCommand {
  return new OpenCounterAccountCommand("Kiosque du Quai", CONTACT, identitySeen, "staff_lea", key);
}

describe("ouvrir un compte au comptoir (K2)", () => {
  it("ouvre la société counter_opened au mensuel, sa trace et son virement, dans cet ordre", async () => {
    const w = world();

    const id = await w.handler.execute(command(true));

    expect(id).toBe("cmp_counter");
    expect(w.log).toEqual(["company", "attestation", "transfer"]);
    const company = w.companies.declared[0];
    expect(company?.status).toBe("counter_opened");
    expect(company?.grantedTerms).toEqual(["monthly"]);
    expect(company?.opening.author).toEqual({ staffUserId: "staff_lea", name: "Léa Martin" });
    expect(w.attestations.recorded[0]?.companyId).toBe("cmp_counter");
    expect(w.attestations.recorded[0]?.attestation.toRecord()).toEqual({
      identitySeen: true,
      attestedByStaffId: "staff_lea",
      attestedAt: NOW,
    });
    expect(w.payers.opened).toEqual([
      { payer: { id: "cmp_counter", name: "Kiosque du Quai" }, at: NOW, staffUserId: "staff_lea" },
    ]);
    expect(w.events.published).toEqual([expect.any(CompanyDeclaredEvent)]);
  });

  it("ouvre aussi quand la case n'est pas cochée : elle n'est pas bloquante", async () => {
    const w = world();

    await w.handler.execute(command(false));

    expect(w.attestations.recorded[0]?.attestation.identitySeen).toBe(false);
    expect(w.payers.opened).toHaveLength(1);
  });

  it("un rejeu de la même intention rend le même compte sans rien rouvrir", async () => {
    const w = world();
    const key = randomUUID();

    await w.handler.execute(command(true, key));
    const again = await w.handler.execute(command(true, key));

    expect(again).toBe("cmp_counter");
    expect(w.log).toEqual(["company", "attestation", "transfer"]);
    expect(w.events.published).toHaveLength(1);
  });

  it("refuse un contact sans téléphone, sans rien écrire", async () => {
    const w = world();

    await expect(
      w.handler.execute(
        new OpenCounterAccountCommand(
          "Kiosque du Quai",
          { ...CONTACT, phone: "" },
          true,
          "staff_lea",
          randomUUID(),
        ),
      ),
    ).rejects.toBeInstanceOf(CounterAccountUnreachableError);
    expect(w.log).toEqual([]);
  });
});

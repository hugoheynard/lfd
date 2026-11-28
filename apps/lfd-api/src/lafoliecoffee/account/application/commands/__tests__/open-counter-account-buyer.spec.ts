import { randomUUID } from "node:crypto";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CounterOpeningAttestations } from "../../../domain/ports/counter-opening-attestations.js";
import { CounterPayerOpening } from "../../../domain/ports/counter-payer-opening.js";
import { StaffDirectory, type StaffIdentity } from "../../../domain/ports/staff-directory.js";
import type { ContactSnapshot } from "../../../domain/value-objects/contact-details.js";
import { OpenCounterAccountCommand } from "../open-counter-account.command.js";
import { OpenCounterAccountHandler } from "../open-counter-account.handler.js";
import { InMemoryCompanies } from "./member-acts-doubles.js";

// Comparée à rien d'autre qu'elle-même : la trace la recopie.
const NOW = new Date("2026-08-07T09:00:00.000Z");

/** La trace d'ouverture doublée : garde l'acheteur qu'on lui confie. */
class BuyerRecordingAttestations extends CounterOpeningAttestations {
  readonly buyers: ContactSnapshot[] = [];
  record(_companyId: string, _attestation: unknown, buyer: ContactSnapshot): Promise<void> {
    this.buyers.push(buyer);
    return Promise.resolve();
  }
}

class SilentPayerOpening extends CounterPayerOpening {
  open(): Promise<void> {
    return Promise.resolve();
  }
}

class KnownStaff extends StaffDirectory {
  identify(): Promise<StaffIdentity | null> {
    return Promise.resolve({ name: "Léa Martin", role: "counter" });
  }
}

describe("l'acheteur d'un compte ouvert au comptoir (K5, § 3.1)", () => {
  it("confie le contact validé à la trace d'ouverture, qui en fait la fiche invité", async () => {
    const attestations = new BuyerRecordingAttestations();
    const handler = new OpenCounterAccountHandler(
      new InMemoryCompanies(),
      attestations,
      new SilentPayerOpening(),
      new KnownStaff(),
      new RecordingPublisher(),
      inMemoryIntents(),
      new DirectUnitOfWork(),
      new FixedClock(NOW),
    );

    await handler.execute(
      new OpenCounterAccountCommand(
        "Kiosque du Quai",
        {
          firstName: "  Camille ",
          lastName: "Rousseau",
          fonction: "",
          email: "Camille@Kiosque.test",
          phone: "06 12 34 56 78",
        },
        true,
        "staff_lea",
        randomUUID(),
      ),
    );

    expect(attestations.buyers).toHaveLength(1);
    expect(attestations.buyers[0]).toMatchObject({ lastName: "Rousseau" });
    // Les valeurs normalisées du domaine, jamais la saisie brute.
    expect(attestations.buyers[0]?.firstName).not.toBe("  Camille ");
  });
});

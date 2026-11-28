import { randomUUID } from "node:crypto";

import { IdentityWithoutLoginMethods } from "../../../domain/ports/__tests__/login-method-doubles.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { Company } from "../../../domain/entities/company.js";
import type { ProvisionedIdentity } from "../../../domain/ports/customer-identity.port.js";
import {
  PendingAccessReader,
  type PendingAccessView,
} from "../../../domain/ports/pending-access.reader.js";
import { CounterAccountHasNoMembersError } from "../../../domain/errors/counter-account-errors.js";
import { IssuePasswordLinkCommand } from "../issue-password-link.command.js";
import { IssuePasswordLinkHandler } from "../issue-password-link.handler.js";
import { InMemoryCompanies, journalNames, RecordingRenewal } from "./member-acts-doubles.js";

/** Le fournisseur d'identité, qui compte les liens qu'on lui fait fabriquer. */
class CountingIdentity extends IdentityWithoutLoginMethods {
  issued = 0;
  changeEmail(): Promise<void> {
    return Promise.resolve();
  }
  provision(): Promise<ProvisionedIdentity> {
    return Promise.resolve({ subject: "auth0|x", passwordSetupUrl: "https://auth/ticket" });
  }
  issuePasswordLink(): Promise<string> {
    this.issued += 1;
    return Promise.resolve("https://auth/ticket-secret");
  }
}

class PendingUser extends PendingAccessReader {
  list(): Promise<readonly PendingAccessView[]> {
    return Promise.resolve([]);
  }
  subjectOf(): Promise<string | null> {
    return Promise.resolve("auth0|abc");
  }
}

/** Un compte ouvert au comptoir : aucun accès client avant conversion. */
class CounterOpenedCompanies extends InMemoryCompanies {
  override load(): Promise<Company | null> {
    return Promise.resolve(
      Company.reconstitute({
        id: "c1",
        raisonSociale: "",
        enseigne: "Café des Halles",
        formeJuridique: "",
        siret: "",
        vatNumber: "",
        contact: null,
        grantedTerms: [],
        requestedTerm: null,
        status: "counter_opened",
        activatedAt: null,
        activatedBy: null,
        suspensionCause: null,
        nafCode: "",
      }),
    );
  }
}

/**
 * Régression : le lien d'un compte ouvert au comptoir était fabriqué chez le
 * fournisseur d'identité avant d'être refusé — un ticket vivant, jamais rendu.
 */
describe("IssuePasswordLinkHandler — compte ouvert au comptoir", () => {
  it("refuse avant tout appel au fournisseur d'identité", async () => {
    const identity = new CountingIdentity();
    const renewal = new RecordingRenewal();
    const handler = new IssuePasswordLinkHandler(
      new PendingUser(),
      identity,
      new FixedClock(new Date("2026-02-03T10:00:00Z")),
      new RecordingPublisher(),
      journalNames(),
      renewal,
      new DirectUnitOfWork(),
      inMemoryIntents(),
      new CounterOpenedCompanies(),
    );

    await expect(
      handler.execute(new IssuePasswordLinkCommand("u1", "c1", "fiche-1", randomUUID())),
    ).rejects.toBeInstanceOf(CounterAccountHasNoMembersError);
    expect(identity.issued).toBe(0);
    expect(renewal.renewed).toHaveLength(0);
  });
});

import { randomUUID } from "node:crypto";

import { RecordingJournal } from "../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../platform/time/fixed-clock.js";
import {
  RecordingAccessCache,
  ScriptedStaffUsers,
  TrackingUnitOfWork,
} from "../../directory/application/__tests__/staff-doubles.js";
import { STAFF_FACTS } from "../../directory/domain/staff-facts.js";
import {
  StaffPasswordLinkAlreadyIssuedError,
  StaffUserNotFoundError,
} from "../../directory/domain/staff-user-errors.js";
import { inMemoryIntents } from "../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { IssueStaffPasswordLinkCommand } from "../issue-staff-password-link.command.js";
import { IssueStaffPasswordLinkHandler } from "../issue-staff-password-link.handler.js";
import {
  PendingStaffAccessReader,
  type PendingStaffAccessView,
  type PendingStaffSubject,
} from "../pending-staff-access.reader.js";
import { StaffIdentityPort } from "../staff-identity.port.js";

/** Un instant quelconque : le test ne le compare qu'à lui-même. */
const NOW = new Date(0);

class OnePending extends PendingStaffAccessReader {
  constructor(private readonly invitee: PendingStaffSubject | null) {
    super();
  }

  list(): Promise<readonly PendingStaffAccessView[]> {
    return Promise.resolve([]);
  }

  pendingOf(): Promise<PendingStaffSubject | null> {
    return Promise.resolve(this.invitee);
  }
}

class LinkFactory extends StaffIdentityPort {
  readonly issued: string[] = [];

  provision(): Promise<{ subject: string; passwordSetupUrl: string }> {
    return Promise.reject(new Error("non attendu"));
  }

  issuePasswordLink(subject: string): Promise<string> {
    this.issued.push(subject);
    return Promise.resolve("https://tenant.invalid/ticket");
  }

  changeEmail(): Promise<void> {
    return Promise.reject(new Error("non attendu"));
  }
}

const SOPHIE: PendingStaffSubject = {
  subject: "auth0|sophie",
  firstName: "Sophie",
  lastName: "Martin",
};

function harness(invitee: PendingStaffSubject | null, journalDown = false) {
  const journal = new RecordingJournal(journalDown ? new Error("journal en panne") : null);
  const identities = new LinkFactory();
  const uow = new TrackingUnitOfWork();
  const staff = new ScriptedStaffUsers(uow);
  const cache = new RecordingAccessCache(uow);
  const handler = new IssueStaffPasswordLinkHandler(
    new OnePending(invitee),
    identities,
    new FixedClock(NOW),
    journal,
    uow,
    staff,
    cache,
    inMemoryIntents(),
  );
  return { handler, journal, identities, staff, cache };
}

describe("IssueStaffPasswordLinkHandler — le lien à remettre à la main", () => {
  it("journalise le geste, jamais le lien", async () => {
    const h = harness(SOPHIE);

    const link = await h.handler.execute(
      new IssueStaffPasswordLinkCommand("s1", "admin-1", randomUUID()),
    );

    expect(link.url).toBe("https://tenant.invalid/ticket");
    expect(h.journal.facts).toEqual([
      {
        type: STAFF_FACTS.passwordLinkIssued,
        subjectType: "staff_user",
        subjectId: "s1",
        payload: {
          subjectLabel: "Sophie Martin",
          person: { firstName: "Sophie", lastName: "Martin" },
        },
      },
    ]);
  });

  it("ne rend pas le lien quand le journal tombe", async () => {
    const h = harness(SOPHIE, true);

    await expect(
      h.handler.execute(new IssueStaffPasswordLinkCommand("s1", "admin-1", randomUUID())),
    ).rejects.toThrow("journal en panne");
  });

  it("refuse une personne qui n'attend plus, sans rien frapper ni tracer", async () => {
    const h = harness(null);

    await expect(
      h.handler.execute(new IssueStaffPasswordLinkCommand("s1", "admin-1", randomUUID())),
    ).rejects.toBeInstanceOf(StaffUserNotFoundError);
    expect(h.identities.issued).toEqual([]);
    expect(h.journal.facts).toEqual([]);
    expect(h.staff.writes).toEqual([]);
  });

  it("renouvelle l'invitation dans la transaction du fait, puis oublie le cache après", async () => {
    // Un lien neuf sans date reposée mènerait à un refus d'entrée : l'accès
    // staff refuse une fiche `invited` dont l'invitation a expiré (§8.1 bis).
    const h = harness(SOPHIE);

    await h.handler.execute(new IssueStaffPasswordLinkCommand("s1", "admin-1", randomUUID()));

    expect(h.staff.writes).toEqual([{ method: "markInvited", insideTransaction: true }]);
    expect(h.cache.forgotten).toEqual([{ insideTransaction: false }]);
  });

  /** Régression : un double clic fabriquait deux liens chez le fournisseur d'identité. */
  it("le rejeu de la même clé est refusé en 409, sans second lien", async () => {
    const h = harness(SOPHIE);
    const key = randomUUID();

    await h.handler.execute(new IssueStaffPasswordLinkCommand("s1", "admin-1", key));
    await expect(
      h.handler.execute(new IssueStaffPasswordLinkCommand("s1", "admin-1", key)),
    ).rejects.toBeInstanceOf(StaffPasswordLinkAlreadyIssuedError);
    expect(h.identities.issued).toHaveLength(1);
  });
});

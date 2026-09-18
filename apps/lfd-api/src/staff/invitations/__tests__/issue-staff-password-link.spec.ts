import { RecordingJournal } from "../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../platform/time/fixed-clock.js";
import { TrackingUnitOfWork } from "../../directory/application/__tests__/staff-doubles.js";
import { STAFF_FACTS } from "../../directory/domain/staff-facts.js";
import { StaffUserNotFoundError } from "../../directory/domain/staff-user-errors.js";
import {
  IssueStaffPasswordLinkCommand,
  IssueStaffPasswordLinkHandler,
} from "../pending-staff-access.js";
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
  const handler = new IssueStaffPasswordLinkHandler(
    new OnePending(invitee),
    identities,
    new FixedClock(NOW),
    journal,
    new TrackingUnitOfWork(),
  );
  return { handler, journal, identities };
}

describe("IssueStaffPasswordLinkHandler — le lien à remettre à la main", () => {
  it("journalise le geste, jamais le lien", async () => {
    const h = harness(SOPHIE);

    const link = await h.handler.execute(new IssueStaffPasswordLinkCommand("s1"));

    expect(link.url).toBe("https://tenant.invalid/ticket");
    expect(h.journal.facts).toEqual([
      {
        type: STAFF_FACTS.passwordLinkIssued,
        subjectType: "staff_user",
        subjectId: "s1",
        payload: { person: { firstName: "Sophie", lastName: "Martin" } },
      },
    ]);
  });

  it("ne rend pas le lien quand le journal tombe", async () => {
    const h = harness(SOPHIE, true);

    await expect(h.handler.execute(new IssueStaffPasswordLinkCommand("s1"))).rejects.toThrow(
      "journal en panne",
    );
  });

  it("refuse une personne qui n'attend plus, sans rien frapper ni tracer", async () => {
    const h = harness(null);

    await expect(h.handler.execute(new IssueStaffPasswordLinkCommand("s1"))).rejects.toBeInstanceOf(
      StaffUserNotFoundError,
    );
    expect(h.identities.issued).toEqual([]);
    expect(h.journal.facts).toEqual([]);
  });
});

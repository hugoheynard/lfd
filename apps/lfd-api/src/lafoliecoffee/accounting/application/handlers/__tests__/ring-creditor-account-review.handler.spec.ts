import { AmbientAfterCommit } from "../../../../../platform/database/after-commit.js";
import {
  CommitQueue,
  runInTransaction,
} from "../../../../../platform/database/transaction.store.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import {
  CreditorAccountConfirmedEvent,
  CreditorAccountProposalCancelledEvent,
  CreditorAccountProposedEvent,
  type CreditorAccountReviewEvent,
} from "../../../domain/events/creditor-account-review.events.js";
import { Bic } from "../../../domain/value-objects/bic.js";
import { CreditorAccount } from "../../../domain/value-objects/creditor-account.js";
import { Iban } from "../../../domain/value-objects/iban.js";
import { LegalAddress } from "../../../domain/value-objects/legal-address.js";
import { PendingCreditorAccount } from "../../../domain/value-objects/pending-creditor-account.js";
import { RingCreditorAccountReview } from "../ring-creditor-account-review.handler.js";

class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}

const AT = new Date(0);
const IBAN = "FR7630006000011234567890189";
const ENTITY = { id: "le1", name: "Crazeativity" };

const PENDING = PendingCreditorAccount.propose(
  CreditorAccount.create({
    holder: "Crazeativity",
    address: LegalAddress.create({
      line1: "Route de la Balme",
      line2: "",
      postalCode: "73150",
      city: "Val d'Isère",
      countryCode: "FR",
    }),
    iban: Iban.create(IBAN),
    bic: Bic.create("CEPAFRPP751"),
  }),
  { id: "pending_1", staffId: "staff_author", at: AT },
);

async function rung(event: CreditorAccountReviewEvent): Promise<readonly StaffNotice[]> {
  const notifier = new RecordingNotifier();
  const work = new BackgroundWork();
  new RingCreditorAccountReview(notifier, work, new AmbientAfterCommit()).handle(event);
  await work.whenIdle();
  return notifier.notices;
}

describe("RingCreditorAccountReview", () => {
  it.each([
    [
      "proposé",
      new CreditorAccountProposedEvent(ENTITY, PENDING, AT),
      "legal_entity.creditor_account_proposed",
    ],
    [
      "confirmé",
      new CreditorAccountConfirmedEvent(ENTITY, PENDING, AT),
      "legal_entity.creditor_account_confirmed",
    ],
    [
      "annulé",
      new CreditorAccountProposalCancelledEvent(ENTITY, PENDING, AT),
      "legal_entity.creditor_account_proposal_cancelled",
    ],
  ])(
    "sonne à la comptabilité quand le compte est %s, une clé par saisie",
    async (_case, event, kind) => {
      const notices = await rung(event);

      expect(notices).toEqual([
        expect.objectContaining({
          kind,
          link: "/comptabilite/entites-juridiques/le1",
          idempotencyKey: `notification:${kind}:pending_1`,
          occurredAt: AT,
          audience: "b2b_accounting:read",
        }),
      ]);
      expect(notices[0]?.subject).toContain("Crazeativity");
      expect(notices[0]?.body).toContain("0189");
      // 🔴 La cloche se lit par toute la comptabilité, et se garde : jamais l'IBAN entier.
      expect(JSON.stringify(notices)).not.toContain(IBAN);
    },
  );

  it("attend la validation de la transaction qui publie", async () => {
    const notifier = new RecordingNotifier();
    const work = new BackgroundWork();
    const commits = new CommitQueue();

    await runInTransaction(
      {},
      () => {
        new RingCreditorAccountReview(notifier, work, new AmbientAfterCommit()).handle(
          new CreditorAccountProposedEvent(ENTITY, PENDING, AT),
        );
        return Promise.resolve();
      },
      commits,
    );
    await work.whenIdle();
    expect(notifier.notices).toEqual([]);

    commits.flush();
    await work.whenIdle();
    expect(notifier.notices).toHaveLength(1);
  });
});

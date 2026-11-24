import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import {
  RecurringOccurrenceFact,
  type RecurringOccurrenceOutcome,
} from "../../../../channels/commerce/occurrence-facts.js";
import { FixedStanding } from "../../__tests__/recurring-doubles.js";
import { OccurrenceIssueBell } from "../occurrence-issue-bell.js";

/** La cloche : les notices reçues, dans l'ordre. */
class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}

const AT = new Date("2026-12-01T05:00:00.000Z");

function fact(outcome: RecurringOccurrenceOutcome, companyId = "chalet"): RecurringOccurrenceFact {
  return new RecurringOccurrenceFact("occ_1", "bsk_1", "user_1", companyId, "2026-12-07", outcome);
}

function build() {
  const notifier = new RecordingNotifier();
  return { notifier, bell: new OccurrenceIssueBell(notifier, new FixedStanding()) };
}

describe("OccurrenceIssueBell — une échéance non passée sonne pour le staff (R5)", () => {
  it("un refus : la société, le jour, la phrase du refus, la fiche des paniers, au seul droit des paniers", async () => {
    const { notifier, bell } = build();

    await bell.ring(
      fact({ kind: "refused", cause: "no_settlement", reason: "Aucun crédit accordé." }),
      AT,
    );

    expect(notifier.notices).toEqual([
      {
        kind: "recurring.occurrence_refused",
        subject: "Commande récurrente non passée — Chalet Gentiane, lundi 7 décembre",
        body: "Aucun crédit accordé.",
        link: "/comptes-clients/chalet/paniers-recurrents",
        idempotencyKey: "notification:recurring.occurrence_refused:occ_1:no_settlement",
        occurredAt: AT,
        audience: "b2b_subscriptions:read",
      },
    ]);
  });

  it("une échéance manquée a son propre titre et sa propre clé", async () => {
    const { notifier, bell } = build();

    await bell.ring(fact({ kind: "missed", cause: "deadline_closed", reason: "Trop tard." }), AT);

    expect(notifier.notices).toMatchObject([
      {
        kind: "recurring.occurrence_missed",
        subject: "Commande récurrente manquée — Chalet Gentiane, lundi 7 décembre",
        idempotencyKey: "notification:recurring.occurrence_missed:occ_1",
      },
    ]);
  });

  it("une société sans nom connu se dit par son identifiant", async () => {
    const { notifier, bell } = build();

    await bell.ring(fact({ kind: "missed", cause: "deadline_closed", reason: "x" }, "co_9"), AT);

    expect(notifier.notices[0]?.subject).toBe(
      "Commande récurrente manquée — co_9, lundi 7 décembre",
    );
  });

  it("une échéance passée ne sonne pas", async () => {
    const { notifier, bell } = build();

    await bell.ring(fact({ kind: "placed", orderId: "ord_1" }), AT);

    expect(notifier.notices).toEqual([]);
  });
});

import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { FixedStanding } from "../../../../occurrence/application/__tests__/recurring-doubles.js";
import { PlannedColumnIssueBell } from "../planned-column-issue-bell.js";
import { PlannedColumnIssueFact, type PlannedColumnIssue } from "../planned-column-facts.js";

class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}

const AT = new Date("2026-12-01T05:00:00.000Z");

const fact = (issue: PlannedColumnIssue): PlannedColumnIssueFact =>
  new PlannedColumnIssueFact("col_1", "chalet", "user_1", "2026-12-07", issue);

function build() {
  const notifier = new RecordingNotifier();
  return { notifier, bell: new PlannedColumnIssueBell(notifier, new FixedStanding()) };
}

describe("PlannedColumnIssueBell — une commande planifiée non passée sonne pour le staff", () => {
  it("un refus : le jour, la phrase du refus, la fiche de la société, au seul droit des paniers", async () => {
    const { notifier, bell } = build();
    await bell.ring(fact({ kind: "refused", cause: "no_settlement", reason: "Aucun crédit." }), AT);
    expect(notifier.notices).toEqual([
      expect.objectContaining({
        kind: "recurring.planned_column_refused",
        subject: expect.stringMatching(
          /^Commande planifiée non passée — .*, lundi 7 décembre$/u,
        ) as string,
        body: "Aucun crédit.",
        link: "/comptes-clients/chalet",
        idempotencyKey: "notification:recurring.planned_column_refused:col_1",
        audience: "b2b_subscriptions:read",
      }),
    ]);
  });

  it("un manqué : son titre et la phrase qui dit d'appeler le client", async () => {
    const { notifier, bell } = build();
    await bell.ring(fact({ kind: "missed" }), AT);
    expect(notifier.notices[0]).toMatchObject({
      kind: "recurring.planned_column_missed",
      subject: expect.stringContaining("Commande planifiée manquée") as string,
      body: expect.stringContaining("Appelez le client") as string,
    });
  });
});

describe("PlannedColumnIssueFact — relu tel qu'écrit", () => {
  it("un refus fait l'aller-retour par la boîte d'envoi", () => {
    const written = fact({ kind: "refused", cause: "buyer_left", reason: "Parti." }).durableFact();
    expect(PlannedColumnIssueFact.fromDelivery(written)).toEqual(
      fact({ kind: "refused", cause: "buyer_left", reason: "Parti." }),
    );
  });

  it("une charge hors forme est refusée", () => {
    expect(() =>
      PlannedColumnIssueFact.fromDelivery({
        type: "recurring.planned_column_refused",
        payload: { columnId: "col_1" },
      }),
    ).toThrow("illisible");
  });
});

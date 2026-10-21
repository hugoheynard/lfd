import { AmbientAfterCommit } from "../../../../../platform/database/after-commit.js";
import {
  CommitQueue,
  runInTransaction,
} from "../../../../../platform/database/transaction.store.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { CollectionReturnedEvent } from "../../../domain/events/collection-return.events.js";
import { CollectionReturn } from "../../../domain/entities/collection-return.js";
import {
  RECORDED_AT,
  rejectInput,
  returnableLine,
} from "../../../domain/entities/__tests__/collection-return-fixtures.js";
import { RingCollectionReturned } from "../ring-collection-returned.handler.js";

class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}

const NOW = new Date(0);

function event(): CollectionReturnedEvent {
  const line = returnableLine();
  return new CollectionReturnedEvent(
    CollectionReturn.record(rejectInput(), line, false),
    line,
    RECORDED_AT,
  );
}

function ringer(notifier: StaffNotifier, work: BackgroundWork): RingCollectionReturned {
  return new RingCollectionReturned(notifier, new FixedClock(NOW), work, new AmbientAfterCommit());
}

describe("RingCollectionReturned", () => {
  it("sonne avec le payeur, le lot, la ligne, une clé par retour", async () => {
    const notifier = new RecordingNotifier();
    const work = new BackgroundWork();

    ringer(notifier, work).handle(event());
    await work.whenIdle();

    expect(notifier.notices).toEqual([
      expect.objectContaining({
        kind: "collection.returned",
        subject: "Prélèvement rejeté — Boulangerie du Port",
        link: "/comptes-clients/co_payer/facturation",
        idempotencyKey: "notification:collection.returned:ret_1",
        occurredAt: NOW,
      }),
    ]);
  });

  /**
   * Régression (2026-10-21) : la cloche partait DANS la transaction de
   * l'enregistrement et l'écrivait une fois close (P2028) — aucune notification.
   */
  it("attend la validation de la transaction qui publie", async () => {
    const notifier = new RecordingNotifier();
    const work = new BackgroundWork();
    const commits = new CommitQueue();

    await runInTransaction(
      {},
      () => {
        ringer(notifier, work).handle(event());
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

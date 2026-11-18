import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  type DeclarationCorrection,
  OutputCorrectionsReader,
} from "../../../../production/channels/packing/index.js";
import {
  type StaffNotice,
  StaffNotifier,
} from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import {
  AppliedCorrectionLedger,
  CorrectionCatchUpDays,
  type CorrectedReceipt,
  HandoffReceipts,
} from "../../../domain/ports/applied-correction.ledger.js";
import { InMemoryShadow } from "../../__tests__/shadow-doubles.js";
import { InMemoryStocks } from "../../__tests__/station-doubles.js";
import { CorrectionBell } from "../correction-bell.js";
import { OutputCorrectionApplier } from "../output-correction-applier.js";

/** Le registre en mémoire, qui ne redescend jamais — comme le `GREATEST` de l'adaptateur. */
export class InMemoryAppliedCorrections extends AppliedCorrectionLedger {
  readonly applied = new Map<string, number>();

  appliedOf(receipt: CorrectedReceipt): Promise<number> {
    return Promise.resolve(this.applied.get(keyOf(receipt)) ?? 0);
  }

  record(receipt: CorrectedReceipt, applied: number): Promise<void> {
    const key = keyOf(receipt);
    this.applied.set(key, Math.max(this.applied.get(key) ?? 0, applied));
    return Promise.resolve();
  }
}

function keyOf(receipt: CorrectedReceipt): string {
  return `${receipt.serviceDay}/${receipt.handoffId}/${receipt.sku}`;
}

/** Les reçus de l'ombre en mémoire : une remise est reçue quand son reçu y est. */
export class ShadowHandoffReceipts extends HandoffReceipts {
  constructor(private readonly shadow: InMemoryShadow) {
    super();
  }

  isReceived(handoffId: string): Promise<boolean> {
    return Promise.resolve(this.shadow.receipts.get(handoffId)?.kind === "handoff");
  }
}

/** Les journées de l'ombre en mémoire où une remise est reçue, à partir d'un jour. */
export class ShadowCatchUpDays extends CorrectionCatchUpDays {
  constructor(private readonly shadow: InMemoryShadow) {
    super();
  }

  daysWithHandoffsFrom(firstDay: string): Promise<readonly string[]> {
    const days = [...this.shadow.receipts.values()]
      .filter((receipt) => receipt.kind === "handoff" && receipt.serviceDay >= firstDay)
      .map((receipt) => receipt.serviceDay);
    return Promise.resolve([...new Set(days)].sort());
  }
}

/** Le fournil, réduit à ses cumuls publiés, par journée. */
export class PublishedCorrections extends OutputCorrectionsReader {
  readonly byDay = new Map<string, readonly DeclarationCorrection[]>();

  correctionsOf(serviceDay: string): Promise<readonly DeclarationCorrection[]> {
    return Promise.resolve(this.byDay.get(serviceDay) ?? []);
  }
}

/** La cloche, qui retient ce qu'elle a reçu. */
export class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}

/** Le colisage d'une correction, câblé sur la mémoire. */
export function correctionScene(now: Date) {
  const shadow = new InMemoryShadow();
  const stocks = new InMemoryStocks(shadow);
  const ledger = new InMemoryAppliedCorrections();
  const published = new PublishedCorrections();
  const notifier = new RecordingNotifier();
  const afterCommit = new HeldAfterCommit();
  const clock = new FixedClock(now);
  const applier = new OutputCorrectionApplier(
    published,
    stocks,
    ledger,
    new ShadowHandoffReceipts(shadow),
    new CorrectionBell(notifier, afterCommit, new BackgroundWork()),
    clock,
  );
  return { shadow, stocks, ledger, published, notifier, afterCommit, clock, applier };
}

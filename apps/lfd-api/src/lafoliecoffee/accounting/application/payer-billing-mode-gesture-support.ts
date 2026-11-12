import type { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import type { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import type { IdGenerator } from "../../../platform/id/id-generator.js";
import type { Clock } from "../../../platform/time/clock.js";
import type { BillingGesture } from "../domain/entities/billing-gesture.js";
import type {
  PayerBillingModeHistory,
  PayerModeChange,
  PayerOpening,
} from "../domain/entities/payer-billing-mode-history.js";
import { PayerBillingModeChangedEvent } from "../domain/events/billing-mode.events.js";
import type { BillingModeDatesReader } from "../domain/ports/billing-mode-dates.reader.js";
import type { LegalEntityRepository } from "../domain/ports/legal-entity.repository.js";
import type { PayerBillingModeRepository } from "../domain/ports/payer-billing-mode.repository.js";
import type { PayerOrderHistoryReader } from "../domain/ports/payer-order-history.reader.js";
import type { PayerStandingReader } from "../domain/ports/payer-standing.reader.js";
import type { ModeTimelines } from "../domain/services/payer-timeline.js";
import { requireBillingPayer } from "../domain/services/billing-payer-guard.js";
import { billingModeOf, type BillingMode } from "../domain/value-objects/billing-mode.js";
import { loadOrFail } from "./legal-entity-support.js";

/** Les ports d'un geste sur le mode d'un payeur — ceux des deux handlers qui le posent. */
export interface PayerModeGesturePorts {
  readonly entities: LegalEntityRepository;
  readonly standings: PayerStandingReader;
  readonly modeDates: BillingModeDatesReader;
  readonly payerModes: PayerBillingModeRepository;
  readonly orderHistory: PayerOrderHistoryReader;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly events: DomainEventPublisher;
  readonly uow: UnitOfWork;
}

/** Ce que le geste demande : quel payeur, chez quelle entité, quel mode, par qui. */
export interface PayerModeGestureInput {
  readonly legalEntityId: string;
  readonly payerCompanyId: string;
  readonly mode: string;
  readonly staffId: string;
}

/** La méthode de l'agrégat qui décide — `change` ou `chooseFirst`. */
export type PayerModeDecision = (
  history: PayerBillingModeHistory,
  mode: BillingMode,
  gesture: BillingGesture,
  modes: ModeTimelines,
  payer: PayerOpening,
) => PayerModeChange | null;

/**
 * Pose le mode d'un payeur. Le domaine juge qu'il est un payeur
 * (`requireBillingPayer`), puis l'agrégat décide par `decide` ; un `null`
 * n'écrit rien et ne journalise rien. Sinon l'historique et le fait
 * `payer.billing_mode_changed` partent dans la même transaction.
 */
export async function applyPayerModeGesture(
  ports: PayerModeGesturePorts,
  input: PayerModeGestureInput,
  decide: PayerModeDecision,
): Promise<void> {
  const mode = billingModeOf(input.mode);
  const entity = await loadOrFail(ports.entities, input.legalEntityId);
  const at = ports.clock.now();
  const payer = requireBillingPayer(
    input.payerCompanyId,
    await ports.standings.standingOf(input.payerCompanyId, at),
    at,
  );
  const history = await ports.payerModes.load(entity.id, payer);
  const modes = await ports.modeDates.timelinesOf(entity.id);
  const change = decide(
    history,
    mode,
    { segmentId: ports.ids.next(), at, staffId: input.staffId },
    modes,
    { opening: !(await ports.orderHistory.hasEverOrdered(payer.id)) },
  );
  if (change === null) {
    return;
  }
  await ports.uow.run(async () => {
    await ports.payerModes.save(history);
    await ports.events.publishTraced(
      new PayerBillingModeChangedEvent(payer, { id: entity.id, name: entity.name }, at, change),
    );
  });
}

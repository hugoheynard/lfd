import type { GpsPoint } from "@lfd/contracts";

import type { DurablePublisher } from "../../platform/outbox/durable-publisher.js";
import type { Clock } from "../../platform/time/clock.js";
import type { DeliveryOrdersReader } from "../channels/commerce/index.js";
import {
  type DepartureHoldsReader,
  DeliveryRoundDepartedFact,
} from "../channels/handover/index.js";
import type { DeliveryRound } from "../domain/entities/delivery-round.js";
import type { StopReadiness } from "../domain/entities/departure-readiness.js";
import { departedStopsOf, refuseHeldOrders } from "../domain/entities/departure-sheet.js";
import type { StopLoading } from "../domain/entities/stop-loading.js";
import { DeliveryRoundDepartedEvent } from "../domain/events/delivery-loading.events.js";
import type { DeliveryRoundRepository } from "../domain/ports/delivery-round.repository.js";
import type { DepartedStopRepository } from "../domain/ports/departed-stop.repository.js";
import type { DoorstepSettingsReader } from "../domain/ports/doorstep-settings.reader.js";
import type { StopLoadingRepository } from "../domain/ports/stop-loading.repository.js";

/** Les ports du départ — ceux des deux portes (chargeur et livreur). */
export interface DepartureDeps {
  readonly rounds: DeliveryRoundRepository;
  readonly loadings: StopLoadingRepository;
  readonly departedStops: DepartedStopRepository;
  readonly orders: DeliveryOrdersReader;
  readonly holds: DepartureHoldsReader;
  readonly doorstepSettings: DoorstepSettingsReader;
  readonly clock: Clock;
  readonly durable: DurablePublisher;
}

/**
 * **Partir, puis figer** — la suite commune aux deux portes du départ
 * (`DepartDeliveryRoundHandler` du chargeur, `DepartMyRoundHandler` du
 * livreur, plan « Ma tournée », MT-D3 v2). Elles partagent ceci et le domaine,
 * pas leur handler : chacune charge la tournée à sa façon — avec ou sans mur
 * — dans SA transaction, et vérifie la version.
 *
 * 1. les lignes de chargement sont verrouillées APRÈS la tournée ;
 * 2. la tournée refuse ou part (`depart`) ;
 * 3. l'exécution fige, pour chaque arrêt, la feuille du commerce, son rang de
 *    passage et son point GPS du carnet (MT-D5 v2), lus à cet instant — et
 *    la décision réglée d'avance à la porte, résolue avec le réglage global
 *    (B3 bis) : une tournée partie ne change plus de règle ;
 * 4. une commande retenue au contrôle qualité arrête tout, en nommant l'arrêt
 *    (`a-la-porte.md`, BQ) — lue au retrait, dans la transaction ;
 * 5. le fait DURABLE `delivery.round_departed` est écrit dans la boîte
 *    d'envoi, dans la même transaction (`plan-depart-durable.md`, DD1) : ici
 *    et pas dans les handlers, pour qu'aucune des deux portes ne l'oublie. Le
 *    retrait (la garde) et le commerce (le courriel) s'y abonnent.
 *
 * À appeler DANS l'unité de travail, la tournée déjà chargée et verrouillée.
 * Rend le fait de JOURNAL du départ : c'est au handler de le publier, dans sa
 * transaction (`lint:journal-tracked` lit l'appel dans le handler).
 */
export async function departAndFreeze(
  round: DeliveryRound,
  deps: DepartureDeps,
): Promise<DeliveryRoundDepartedEvent> {
  const loadings = await deps.loadings.forRound(round);
  const [sheets, points, held, globalRule] = await Promise.all([
    deps.orders.departureSheetsOf(round.orderIds),
    deps.orders.stopPointsOf(round.orderIds),
    deps.holds.heldOrders(round.orderIds),
    deps.doorstepSettings.current(),
  ]);
  const references = new Map(sheets.map((sheet) => [sheet.orderId, sheet.reference]));
  const at = deps.clock.now();
  round.depart(at, readinessOf(loadings, references));
  const gps = new Map<string, GpsPoint | null>(points.map((point) => [point.orderId, point.gps]));
  const departed = departedStopsOf(round, at, sheets, gps, globalRule);
  refuseHeldOrders(round, sheets, held);
  await deps.rounds.save(round);
  await deps.departedStops.record(departed);
  await deps.durable.publish(
    new DeliveryRoundDepartedFact(round.id, round.serviceDay, at, round.orderIds).durableFact(),
  );
  return new DeliveryRoundDepartedEvent(round, liveBinCount(loadings));
}

function readinessOf(
  loadings: readonly StopLoading[],
  references: ReadonlyMap<string, string>,
): readonly StopReadiness[] {
  return loadings.map((loading) => ({
    stopId: loading.stopId,
    reference: references.get(loading.orderId) ?? loading.orderId,
    state: loading.state,
    binsToRedo: loading.binsToRedo,
  }));
}

/** Les bacs non annulés qui partent — tous chargés, puisque la tournée est partie. */
function liveBinCount(loadings: readonly StopLoading[]): number {
  return loadings.reduce((sum, loading) => sum + loading.liveBinCount, 0);
}

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { DeliveryRound } from "../../../domain/entities/delivery-round.js";
import type { DoorstepStopState } from "../../../domain/entities/doorstep-stop.js";
import { DoorstepHandover } from "../../doorstep-handover.js";
import { InMemoryDoorstepStops, ScriptedDoorstepAttestor } from "./doorstep-doubles.js";
import { InMemoryDeliveryRounds } from "./round-doubles.js";

/**
 * La scène des gestes qui remettent à la porte (`plan-a-la-porte.md`, B1, B2) :
 * une tournée partie de Paul, deux arrêts, le retrait doublé, la publication
 * retenue jusqu'à la validation. Partagée par « Remis » et « Déposé ».
 */

// Des instants comparés entre eux seulement, jamais à l'horloge.
export const DAY = "2030-03-12";
export const DEPARTED = new Date(1_000);
export const NOW = new Date(5_000);
export const PAUL = "staff_paul";
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

export function roundState(returnedAt: Date | null = null): DeliveryRound {
  return DeliveryRound.restore({
    id: "r_1",
    serviceDay: DAY,
    vehicleId: "v_1",
    vehicleName: "Kangoo",
    passage: 1,
    version: 2,
    departedAt: DEPARTED,
    driverStaffId: PAUL,
    createdAt: new Date(0),
    updatedAt: DEPARTED,
    returned: returnedAt === null ? null : { at: returnedAt, byStaffId: PAUL, byName: "Paul" },
    stops: [
      { id: "s_1", orderId: "o_1", position: 1, closedAt: null },
      { id: "s_2", orderId: "o_2", position: 2, closedAt: null },
    ],
  });
}

export function doorstep(overrides: Partial<DoorstepStopState> = {}): DoorstepStopState {
  return {
    stopId: "s_1",
    orderId: "o_1",
    round: { roundId: "r_1", vehicleName: "Kangoo", serviceDay: DAY, passage: 1 },
    departedAt: DEPARTED,
    returnedAt: null,
    reference: "CMD-1",
    closedAt: null,
    arrivedAt: null,
    signatureRequired: false,
    depositAllowed: false,
    decision: null,
    ...overrides,
  };
}

/** La tournée dont l'écriture échoue : `closeStop` ne passe pas en base. */
export class FailingRounds extends InMemoryDeliveryRounds {
  override save(): Promise<void> {
    return Promise.reject(new RangeError("écriture de la tournée refusée"));
  }
}

export function handoverScene(
  options: { stop?: Partial<DoorstepStopState>; rounds?: InMemoryDeliveryRounds } = {},
) {
  const rounds = options.rounds ?? new InMemoryDeliveryRounds(roundState());
  const attestor = new ScriptedDoorstepAttestor();
  const events = new RecordingPublisher();
  const afterCommit = new HeldAfterCommit();
  const handover = new DoorstepHandover(
    rounds,
    new InMemoryDoorstepStops(PAUL, doorstep(options.stop)),
    attestor,
    new FixedClock(NOW),
    afterCommit,
  );
  return { handover, rounds, attestor, events, afterCommit, uow: new DirectUnitOfWork() };
}

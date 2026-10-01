import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { DeliveryRound } from "../../../domain/entities/delivery-round.js";
import type { DoorstepStopState } from "../../../domain/entities/doorstep-stop.js";
import {
  DeliveryRoundReturnedError,
  DoorstepRoundStaleError,
  DoorstepStopNotFoundError,
  HandoverPhotoMissingError,
  HandoverSignatureMissingError,
  StopClosedWithoutHandoverError,
} from "../../../domain/errors/delivery-doorstep-errors.js";
import { DriverRoundNotFoundError } from "../../../domain/errors/delivery-driver-errors.js";
import { HandOverStopCommand } from "../hand-over-stop.command.js";
import { HandOverStopHandler } from "../hand-over-stop.handler.js";
import { InMemoryDoorstepStops, ScriptedDoorstepAttestor } from "./doorstep-doubles.js";
import { InMemoryDeliveryRounds } from "./round-doubles.js";

// Des instants comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const DEPARTED = new Date(1_000);
const NOW = new Date(5_000);
const PAUL = "staff_paul";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function roundState(returnedAt: Date | null = null): DeliveryRound {
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

function doorstep(overrides: Partial<DoorstepStopState> = {}): DoorstepStopState {
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
    ...overrides,
  };
}

/** La tournée dont l'écriture échoue : `closeStop` ne passe pas en base. */
class FailingRounds extends InMemoryDeliveryRounds {
  override save(): Promise<void> {
    return Promise.reject(new RangeError("écriture de la tournée refusée"));
  }
}

function scene(
  options: { stop?: Partial<DoorstepStopState>; rounds?: InMemoryDeliveryRounds } = {},
) {
  const rounds = options.rounds ?? new InMemoryDeliveryRounds(roundState());
  const attestor = new ScriptedDoorstepAttestor();
  const events = new RecordingPublisher();
  const afterCommit = new HeldAfterCommit();
  const handler = new HandOverStopHandler(
    rounds,
    new InMemoryDoorstepStops(PAUL, doorstep(options.stop)),
    attestor,
    new FixedClock(NOW),
    events,
    afterCommit,
    new DirectUnitOfWork(),
  );
  return { handler, rounds, attestor, events, afterCommit };
}

function remis(
  overrides: {
    staff?: string;
    stopId?: string;
    version?: number;
    name?: string;
    photo?: Buffer | null;
    signature?: Buffer | null;
  } = {},
): HandOverStopCommand {
  return new HandOverStopCommand(
    overrides.staff ?? PAUL,
    "r_1",
    overrides.stopId ?? "s_1",
    { version: overrides.version ?? 2, receiverName: overrides.name ?? "Mme Durand" },
    overrides.photo === undefined ? JPEG : overrides.photo,
    overrides.signature ?? null,
  );
}

describe("HandOverStopHandler — « Remis au client » (B1)", () => {
  it("atteste avec les pièces, clôt l'arrêt, journalise ; publie APRÈS la validation seulement", async () => {
    const { handler, rounds, attestor, events, afterCommit } = scene();

    await handler.execute(remis({ name: "  Mme Durand " }));

    expect(attestor.attested).toEqual([
      {
        orderId: "o_1",
        by: PAUL,
        receiverName: "Mme Durand",
        proofs: { photoKey: "proofs/1/photo", signatureKey: null },
      },
    ]);
    expect(rounds.stored("r_1")?.hasClosed("s_1")).toBe(true);
    expect(events.factTypes()).toEqual(["delivery_round.stop_handed_over"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: "Kangoo",
      day: DAY,
      passage: 1,
      order: { id: "o_1", name: "CMD-1" },
      signed: false,
    });
    expect(attestor.published).toEqual([]);

    await afterCommit.commit();

    expect(attestor.published).toEqual(["attested:o_1"]);
    expect(attestor.discarded).toEqual([]);
  });

  it("🔴 AP-D1 : `closeStop` qui échoue — rien ne publie, les pièces sont retirées", async () => {
    const { handler, attestor, afterCommit } = scene({
      rounds: new FailingRounds(roundState()),
    });

    await expect(handler.execute(remis())).rejects.toThrow("écriture de la tournée refusée");
    afterCommit.discard();
    await afterCommit.commit();

    expect(attestor.published).toEqual([]);
    expect(attestor.discarded).toEqual([{ photoKey: "proofs/1/photo", signatureKey: null }]);
  });

  it("🔴 sans photo, rien ne part : ni stockage, ni attestation (§ 9)", async () => {
    const { handler, attestor } = scene();

    await expect(handler.execute(remis({ photo: null, signature: PNG }))).rejects.toThrow(
      HandoverPhotoMissingError,
    );
    expect(attestor.staged).toEqual([]);
    expect(attestor.attested).toEqual([]);
  });

  it("🔴 la signature exigée au départ manque : refus nommé, pièces retirées (AP-D4)", async () => {
    const { handler, rounds, attestor } = scene({ stop: { signatureRequired: true } });

    await expect(handler.execute(remis())).rejects.toThrow(HandoverSignatureMissingError);
    expect(attestor.attested).toEqual([]);
    expect(rounds.saved).toEqual([]);
    expect(attestor.discarded).toHaveLength(1);
  });

  it("signée quand elle est exigée : la signature est rangée et le fait le dit", async () => {
    const { handler, attestor, events } = scene({ stop: { signatureRequired: true } });

    await handler.execute(remis({ signature: PNG }));

    expect(attestor.attested[0]?.proofs.signatureKey).toBe("proofs/1/signature");
    expect(events.traced[0]?.journalFact().payload).toMatchObject({ signed: true });
  });

  it("le refus du retrait remonte tel quel ; l'arrêt reste ouvert, rien ne publie", async () => {
    const { handler, rounds, attestor, afterCommit } = scene();
    attestor.refusal = "Cette commande est annulée.";

    await expect(handler.execute(remis())).rejects.toThrow("Cette commande est annulée.");
    await afterCommit.commit();

    expect(rounds.saved).toEqual([]);
    expect(attestor.published).toEqual([]);
    expect(attestor.discarded).toHaveLength(1);
  });

  it("🔴 rejeu sur un arrêt remis : « déjà fait », l'attestation EXISTANTE republiée", async () => {
    const { handler, rounds, attestor, events, afterCommit } = scene();
    await handler.execute(remis());
    await afterCommit.commit();

    // L'écran rejoue après une perte de réseau, avec la version qu'il avait lue.
    await handler.execute(remis());
    await afterCommit.commit();

    expect(rounds.saved).toEqual(["r_1"]);
    expect(attestor.attested).toHaveLength(1);
    expect(events.traced).toHaveLength(1);
    expect(attestor.published).toEqual(["attested:o_1", "replayed:o_1"]);
    expect(attestor.discarded).toEqual([{ photoKey: "proofs/2/photo", signatureKey: null }]);
  });

  it("🔴 rejeu sur un arrêt clos SANS remise : refusé en le nommant", async () => {
    const round = roundState();
    round.closeStop("s_1", NOW);
    const { handler, attestor } = scene({ rounds: new InMemoryDeliveryRounds(round) });

    await expect(handler.execute(remis({ version: 3 }))).rejects.toThrow(
      StopClosedWithoutHandoverError,
    );
    expect(attestor.attested).toEqual([]);
  });

  it("refuse une version périmée, et une tournée rentrée", async () => {
    await expect(scene().handler.execute(remis({ version: 1 }))).rejects.toThrow(
      DoorstepRoundStaleError,
    );
    const returned = scene({ rounds: new InMemoryDeliveryRounds(roundState(NOW)) });
    await expect(returned.handler.execute(remis())).rejects.toThrow(DeliveryRoundReturnedError);
  });

  it("🔴 le mur : la tournée d'un autre livreur prend 404 ; un arrêt qui n'est pas le sien aussi", async () => {
    const { handler, attestor } = scene();

    await expect(handler.execute(remis({ staff: "staff_lea" }))).rejects.toThrow(
      DriverRoundNotFoundError,
    );
    await expect(handler.execute(remis({ stopId: "s_9" }))).rejects.toThrow(
      DoorstepStopNotFoundError,
    );
    expect(attestor.attested).toEqual([]);
  });
});

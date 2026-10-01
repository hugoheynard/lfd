import type { DoorstepStopState } from "../../../domain/entities/doorstep-stop.js";
import {
  DeliveryRoundReturnedError,
  DepositNotAllowedError,
  DepositPhotoMissingError,
  DepositSignatureRequiredError,
  DoorstepRoundStaleError,
  DoorstepStopNotFoundError,
  StopClosedWithoutHandoverError,
} from "../../../domain/errors/delivery-doorstep-errors.js";
import { DriverRoundNotFoundError } from "../../../domain/errors/delivery-driver-errors.js";
import { DepositStopCommand } from "../deposit-stop.command.js";
import { DepositStopHandler } from "../deposit-stop.handler.js";
import {
  DAY,
  FailingRounds,
  handoverScene,
  JPEG,
  NOW,
  PAUL,
  roundState,
} from "./doorstep-handover-scene.js";
import { InMemoryDeliveryRounds } from "./round-doubles.js";

/** L'adresse autorise le dépôt, aucune signature exigée : le cas où le geste existe. */
const PERMITTED: Partial<DoorstepStopState> = { depositAllowed: true };

function scene(
  options: { stop?: Partial<DoorstepStopState>; rounds?: InMemoryDeliveryRounds } = {},
) {
  const built = handoverScene({ ...options, stop: options.stop ?? PERMITTED });
  return { ...built, handler: new DepositStopHandler(built.handover, built.events, built.uow) };
}

function depose(
  overrides: { staff?: string; stopId?: string; version?: number; photo?: Buffer | null } = {},
): DepositStopCommand {
  return new DepositStopCommand(
    overrides.staff ?? PAUL,
    "r_1",
    overrides.stopId ?? "s_1",
    { version: overrides.version ?? 2 },
    overrides.photo === undefined ? JPEG : overrides.photo,
  );
}

describe("DepositStopHandler — « Déposé avec preuve » (B2)", () => {
  it("atteste SANS personne, la photo seule, clôt l'arrêt, journalise ; publie après la validation", async () => {
    const { handler, rounds, attestor, events, afterCommit } = scene();

    await handler.execute(depose());

    expect(attestor.staged).toEqual([
      { photo: { bytes: JPEG, contentType: "image/jpeg" }, signature: null },
    ]);
    expect(attestor.attested).toEqual([
      {
        orderId: "o_1",
        by: PAUL,
        receiverName: null,
        proofs: { photoKey: "proofs/1/photo", signatureKey: null },
      },
    ]);
    expect(rounds.stored("r_1")?.hasClosed("s_1")).toBe(true);
    expect(events.factTypes()).toEqual(["delivery_round.stop_deposited"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: "Kangoo",
      day: DAY,
      passage: 1,
      order: { id: "o_1", name: "CMD-1" },
    });
    expect(attestor.published).toEqual([]);

    await afterCommit.commit();

    expect(attestor.published).toEqual(["attested:o_1"]);
    expect(attestor.discarded).toEqual([]);
  });

  it("🔴 sans photo, rien ne part : ni stockage, ni attestation", async () => {
    const { handler, attestor } = scene();

    await expect(handler.execute(depose({ photo: null }))).rejects.toThrow(
      DepositPhotoMissingError,
    );
    expect(attestor.staged).toEqual([]);
    expect(attestor.attested).toEqual([]);
  });

  it("🔴 dépôt non autorisé au départ : refus nommé, arrêt ouvert, photo retirée", async () => {
    const { handler, rounds, attestor } = scene({ stop: { depositAllowed: false } });

    await expect(handler.execute(depose())).rejects.toThrow(DepositNotAllowedError);
    expect(attestor.attested).toEqual([]);
    expect(rounds.saved).toEqual([]);
    expect(attestor.discarded).toHaveLength(1);
  });

  it("🔴 signature exigée : jamais de dépôt, même autorisé à l'adresse (AP-Q6)", async () => {
    const { handler, rounds, attestor } = scene({
      stop: { depositAllowed: true, signatureRequired: true },
    });

    await expect(handler.execute(depose())).rejects.toThrow(DepositSignatureRequiredError);
    expect(attestor.attested).toEqual([]);
    expect(rounds.saved).toEqual([]);
  });

  it("🔴 AP-D1 : `closeStop` qui échoue — rien ne publie, la photo est retirée", async () => {
    const { handler, attestor, afterCommit } = scene({
      rounds: new FailingRounds(roundState()),
    });

    await expect(handler.execute(depose())).rejects.toThrow("écriture de la tournée refusée");
    afterCommit.discard();
    await afterCommit.commit();

    expect(attestor.published).toEqual([]);
    expect(attestor.discarded).toEqual([{ photoKey: "proofs/1/photo", signatureKey: null }]);
  });

  it("le refus du retrait remonte tel quel ; l'arrêt reste ouvert", async () => {
    const { handler, rounds, attestor } = scene();
    attestor.refusal = "Cette commande est annulée.";

    await expect(handler.execute(depose())).rejects.toThrow("Cette commande est annulée.");
    expect(rounds.saved).toEqual([]);
  });

  it("🔴 rejeu sur un arrêt déposé : « déjà fait », l'attestation EXISTANTE republiée", async () => {
    const { handler, rounds, attestor, events, afterCommit } = scene();
    await handler.execute(depose());
    await afterCommit.commit();

    await handler.execute(depose());
    await afterCommit.commit();

    expect(rounds.saved).toEqual(["r_1"]);
    expect(attestor.attested).toHaveLength(1);
    expect(events.traced).toHaveLength(1);
    expect(attestor.published).toEqual(["attested:o_1", "replayed:o_1"]);
  });

  it("🔴 rejeu sur un arrêt clos SANS remise : refusé en le nommant", async () => {
    const round = roundState();
    round.closeStop("s_1", NOW);
    const { handler, attestor } = scene({ rounds: new InMemoryDeliveryRounds(round) });

    await expect(handler.execute(depose({ version: 3 }))).rejects.toThrow(
      StopClosedWithoutHandoverError,
    );
    expect(attestor.attested).toEqual([]);
  });

  it("refuse une version périmée, et une tournée rentrée", async () => {
    await expect(scene().handler.execute(depose({ version: 1 }))).rejects.toThrow(
      DoorstepRoundStaleError,
    );
    const returned = scene({ rounds: new InMemoryDeliveryRounds(roundState(NOW)) });
    await expect(returned.handler.execute(depose())).rejects.toThrow(DeliveryRoundReturnedError);
  });

  it("🔴 le mur : la tournée d'un autre livreur prend 404 ; un arrêt qui n'est pas le sien aussi", async () => {
    const { handler, attestor } = scene();

    await expect(handler.execute(depose({ staff: "staff_lea" }))).rejects.toThrow(
      DriverRoundNotFoundError,
    );
    await expect(handler.execute(depose({ stopId: "s_9" }))).rejects.toThrow(
      DoorstepStopNotFoundError,
    );
    expect(attestor.attested).toEqual([]);
  });
});

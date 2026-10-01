import {
  DeliveryRoundReturnedError,
  DoorstepRoundStaleError,
  DoorstepStopNotFoundError,
  HandoverPhotoMissingError,
  HandoverSignatureMissingError,
  StopClosedWithoutHandoverError,
} from "../../../domain/errors/delivery-doorstep-errors.js";
import { DriverRoundNotFoundError } from "../../../domain/errors/delivery-driver-errors.js";
import type { DoorstepStopState } from "../../../domain/entities/doorstep-stop.js";
import { HandOverStopCommand } from "../hand-over-stop.command.js";
import { HandOverStopHandler } from "../hand-over-stop.handler.js";
import {
  DAY,
  FailingRounds,
  handoverScene,
  JPEG,
  NOW,
  PAUL,
  PNG,
  roundState,
} from "./doorstep-handover-scene.js";
import { InMemoryDeliveryRounds } from "./round-doubles.js";

function scene(
  options: { stop?: Partial<DoorstepStopState>; rounds?: InMemoryDeliveryRounds } = {},
) {
  const built = handoverScene(options);
  return { ...built, handler: new HandOverStopHandler(built.handover, built.events, built.uow) };
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

import type { PurchaseVehicleCandidatePayload } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { PurchaseVehicleCandidate } from "../../../domain/entities/purchase-vehicle-candidate.js";
import {
  InvalidPurchaseUrlError,
  PurchaseCandidateAlreadyArchivedError,
  PurchaseCandidateNameTakenError,
  PurchaseCandidateNotFoundError,
} from "../../../domain/errors/delivery-purchase-errors.js";
import { ArchivePurchaseVehicleCandidateCommand } from "../archive-purchase-vehicle-candidate.command.js";
import { ArchivePurchaseVehicleCandidateHandler } from "../archive-purchase-vehicle-candidate.handler.js";
import { CorrectPurchaseVehicleCandidateCommand } from "../correct-purchase-vehicle-candidate.command.js";
import { CorrectPurchaseVehicleCandidateHandler } from "../correct-purchase-vehicle-candidate.handler.js";
import { DeclarePurchaseVehicleCandidateCommand } from "../declare-purchase-vehicle-candidate.command.js";
import { DeclarePurchaseVehicleCandidateHandler } from "../declare-purchase-vehicle-candidate.handler.js";
import { ReactivatePurchaseVehicleCandidateCommand } from "../reactivate-purchase-vehicle-candidate.command.js";
import { ReactivatePurchaseVehicleCandidateHandler } from "../reactivate-purchase-vehicle-candidate.handler.js";
import { InMemoryVehicleCandidates } from "./purchase-library-doubles.js";

const CREATED = new Date(0);
const NOW = new Date(3_600_000);
const ANNE = { staffUserId: "staff_2", name: "Anne B", role: "admin" };

const KANGOO: PurchaseVehicleCandidatePayload = {
  name: "Kangoo L2",
  cargo: { lengthCm: 220, widthCm: 150, heightCm: 125 },
  wheelArches: null,
  reference: "KL2",
  purchaseUrl: "https://exemple.fr/kangoo",
  priceCentsExclVat: 2_500_000,
};

function existing(id: string, name: string): PurchaseVehicleCandidate {
  return PurchaseVehicleCandidate.declare({
    ...KANGOO,
    name,
    id,
    at: CREATED,
    author: { staffUserId: "staff_1", name: "", role: "" },
  });
}

function world(...candidates: readonly PurchaseVehicleCandidate[]) {
  const repo = new InMemoryVehicleCandidates(...candidates);
  const events = new RecordingPublisher();
  const directory = new FixedStaffAuthorDirectory(
    authorsKnownAs(
      { firstName: "Anne", lastName: "B", staffUserId: "staff_2", role: "admin" },
      "staff_2",
    ),
  );
  const clock = new FixedClock(NOW);
  const uow = new DirectUnitOfWork();
  return {
    repo,
    events,
    declare: new DeclarePurchaseVehicleCandidateHandler(
      repo,
      directory,
      new FixedIdGenerator("pvc"),
      clock,
      events,
      uow,
    ),
    correct: new CorrectPurchaseVehicleCandidateHandler(repo, directory, clock, events, uow),
    archive: new ArchivePurchaseVehicleCandidateHandler(repo, directory, clock, events, uow),
    reactivate: new ReactivatePurchaseVehicleCandidateHandler(repo, directory, clock, events, uow),
  };
}

describe("les véhicules candidats (bibliothèque d'achat, B1)", () => {
  it("déclare, auteur figé, et trace la fiche entière prix compris", async () => {
    const w = world();

    const id = await w.declare.execute(
      new DeclarePurchaseVehicleCandidateCommand(KANGOO, "staff_2"),
    );

    expect(id).toBe("pvc_000001");
    expect(w.repo.saved[0]?.toState()).toMatchObject({
      ...KANGOO,
      createdAt: NOW,
      createdByStaffId: "staff_2",
      updatedBy: ANNE,
    });
    expect(w.events.factTypes()).toEqual(["delivery_purchase_vehicle_candidate.declared"]);
    expect(w.events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "delivery_purchase_vehicle_candidate",
      subjectId: id,
      payload: { subjectLabel: "Kangoo L2", candidate: KANGOO },
    });
  });

  it("refuse un nom déjà porté par un candidat en cours, sans rien écrire", async () => {
    const w = world(existing("pvc_a", "Kangoo L2"));

    await expect(
      w.declare.execute(new DeclarePurchaseVehicleCandidateCommand(KANGOO, "staff_2")),
    ).rejects.toThrow(PurchaseCandidateNameTakenError);
    expect(w.repo.saved).toHaveLength(0);
    expect(w.events.traced).toHaveLength(0);
  });

  it("reprend le nom d'un candidat archivé", async () => {
    const old = existing("pvc_a", "Kangoo L2");
    old.archive(CREATED, ANNE);
    const w = world(old);

    await w.declare.execute(new DeclarePurchaseVehicleCandidateCommand(KANGOO, "staff_2"));

    expect(w.repo.saved).toHaveLength(1);
  });

  it("refuse un lien http au domaine, sans rien écrire", async () => {
    const w = world();

    await expect(
      w.declare.execute(
        new DeclarePurchaseVehicleCandidateCommand(
          { ...KANGOO, purchaseUrl: "http://exemple.fr" },
          "staff_2",
        ),
      ),
    ).rejects.toThrow(InvalidPurchaseUrlError);
    expect(w.events.traced).toHaveLength(0);
  });

  it("corrige et trace l'avant et l'après ; refuse un nom pris par un autre", async () => {
    const w = world(existing("pvc_a", "Kangoo L2"), existing("pvc_b", "Trafic"));

    await w.correct.execute(
      new CorrectPurchaseVehicleCandidateCommand(
        "pvc_a",
        { ...KANGOO, priceCentsExclVat: null },
        "staff_2",
      ),
    );
    expect(w.events.traced[0]?.journalFact()).toMatchObject({
      type: "delivery_purchase_vehicle_candidate.corrected",
      payload: {
        before: { priceCentsExclVat: 2_500_000 },
        after: { priceCentsExclVat: null },
      },
    });
    expect((await w.repo.load("pvc_a"))?.toState().updatedBy).toEqual(ANNE);

    await expect(
      w.correct.execute(
        new CorrectPurchaseVehicleCandidateCommand(
          "pvc_a",
          { ...KANGOO, name: "Trafic" },
          "staff_2",
        ),
      ),
    ).rejects.toThrow(PurchaseCandidateNameTakenError);
  });

  it("archive une fois, réactive, et refuse de réactiver sur un nom repris", async () => {
    const w = world(existing("pvc_a", "Kangoo L2"));

    await w.archive.execute(new ArchivePurchaseVehicleCandidateCommand("pvc_a", "staff_2"));
    expect((await w.repo.load("pvc_a"))?.archivedAt).toEqual(NOW);
    await expect(
      w.archive.execute(new ArchivePurchaseVehicleCandidateCommand("pvc_a", "staff_2")),
    ).rejects.toThrow(PurchaseCandidateAlreadyArchivedError);

    await w.declare.execute(new DeclarePurchaseVehicleCandidateCommand(KANGOO, "staff_2"));
    await expect(
      w.reactivate.execute(new ReactivatePurchaseVehicleCandidateCommand("pvc_a", "staff_2")),
    ).rejects.toThrow(PurchaseCandidateNameTakenError);

    expect(w.events.factTypes()).toEqual([
      "delivery_purchase_vehicle_candidate.archived",
      "delivery_purchase_vehicle_candidate.declared",
    ]);
  });

  it("réactive un candidat archivé dont le nom est libre", async () => {
    const old = existing("pvc_a", "Kangoo L2");
    old.archive(CREATED, ANNE);
    const w = world(old);

    await w.reactivate.execute(new ReactivatePurchaseVehicleCandidateCommand("pvc_a", "staff_2"));

    expect((await w.repo.load("pvc_a"))?.inLibrary).toBe(true);
    expect(w.events.factTypes()).toEqual(["delivery_purchase_vehicle_candidate.reactivated"]);
  });

  it("refuse un identifiant inconnu (404)", async () => {
    const w = world();

    await expect(
      w.archive.execute(new ArchivePurchaseVehicleCandidateCommand("nope", "staff_2")),
    ).rejects.toThrow(PurchaseCandidateNotFoundError);
  });
});

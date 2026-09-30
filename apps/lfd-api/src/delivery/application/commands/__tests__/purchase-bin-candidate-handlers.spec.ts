import type { PurchaseBinCandidatePayload } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { PurchaseBinCandidate } from "../../../domain/entities/purchase-bin-candidate.js";
import { BinInnerExceedsOuterError } from "../../../domain/errors/delivery-bin-errors.js";
import {
  InvalidPurchasePriceError,
  PurchaseCandidateNameTakenError,
  PurchaseCandidateNotArchivedError,
  PurchaseCandidateNotFoundError,
} from "../../../domain/errors/delivery-purchase-errors.js";
import { ArchivePurchaseBinCandidateCommand } from "../archive-purchase-bin-candidate.command.js";
import { ArchivePurchaseBinCandidateHandler } from "../archive-purchase-bin-candidate.handler.js";
import { CorrectPurchaseBinCandidateCommand } from "../correct-purchase-bin-candidate.command.js";
import { CorrectPurchaseBinCandidateHandler } from "../correct-purchase-bin-candidate.handler.js";
import { DeclarePurchaseBinCandidateCommand } from "../declare-purchase-bin-candidate.command.js";
import { DeclarePurchaseBinCandidateHandler } from "../declare-purchase-bin-candidate.handler.js";
import { ReactivatePurchaseBinCandidateCommand } from "../reactivate-purchase-bin-candidate.command.js";
import { ReactivatePurchaseBinCandidateHandler } from "../reactivate-purchase-bin-candidate.handler.js";
import { InMemoryBinCandidates } from "./purchase-library-doubles.js";

const CREATED = new Date(0);
const NOW = new Date(3_600_000);

const CAISSE: PurchaseBinCandidatePayload = {
  name: "Caisse Dupont 50",
  outer: { lengthCm: 60, widthCm: 40, heightCm: 30 },
  inner: { lengthCm: 56, widthCm: 36, heightCm: 27 },
  isotherm: false,
  maxStack: 5,
  supplier: "Dupont",
  reference: null,
  purchaseUrl: null,
  unitPriceCentsExclVat: 1_290,
};

function existing(id: string, name: string): PurchaseBinCandidate {
  return PurchaseBinCandidate.declare({
    ...CAISSE,
    name,
    id,
    at: CREATED,
    author: { staffUserId: "staff_1", name: "", role: "" },
  });
}

function world(...candidates: readonly PurchaseBinCandidate[]) {
  const repo = new InMemoryBinCandidates(...candidates);
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
    declare: new DeclarePurchaseBinCandidateHandler(
      repo,
      directory,
      new FixedIdGenerator("pbc"),
      clock,
      events,
      uow,
    ),
    correct: new CorrectPurchaseBinCandidateHandler(repo, directory, clock, events, uow),
    archive: new ArchivePurchaseBinCandidateHandler(repo, directory, clock, events, uow),
    reactivate: new ReactivatePurchaseBinCandidateHandler(repo, directory, clock, events, uow),
  };
}

describe("les formats de bacs candidats (bibliothèque d'achat, B1)", () => {
  it("déclare et trace la fiche entière", async () => {
    const w = world();

    const id = await w.declare.execute(new DeclarePurchaseBinCandidateCommand(CAISSE, "staff_2"));

    expect(id).toBe("pbc_000001");
    expect(w.events.traced[0]?.journalFact()).toMatchObject({
      type: "delivery_purchase_bin_candidate.declared",
      subjectType: "delivery_purchase_bin_candidate",
      payload: { subjectLabel: "Caisse Dupont 50", candidate: CAISSE },
    });
  });

  it("refuse la géométrie d'un type de bac impossible, et un prix négatif", async () => {
    const w = world();
    const tooWide = { ...CAISSE, inner: { ...CAISSE.inner, widthCm: 41 } };

    await expect(
      w.declare.execute(new DeclarePurchaseBinCandidateCommand(tooWide, "staff_2")),
    ).rejects.toThrow(BinInnerExceedsOuterError);
    await expect(
      w.declare.execute(
        new DeclarePurchaseBinCandidateCommand({ ...CAISSE, unitPriceCentsExclVat: -1 }, "staff_2"),
      ),
    ).rejects.toThrow(InvalidPurchasePriceError);
    expect(w.repo.saved).toHaveLength(0);
  });

  it("refuse un doublon de nom parmi les candidats en cours", async () => {
    const w = world(existing("pbc_a", "Caisse Dupont 50"));

    await expect(
      w.declare.execute(new DeclarePurchaseBinCandidateCommand(CAISSE, "staff_2")),
    ).rejects.toThrow(PurchaseCandidateNameTakenError);
  });

  it("corrige : l'avant et l'après au journal", async () => {
    const w = world(existing("pbc_a", "Caisse Dupont 50"));

    await w.correct.execute(
      new CorrectPurchaseBinCandidateCommand("pbc_a", { ...CAISSE, maxStack: 4 }, "staff_2"),
    );

    expect(w.events.traced[0]?.journalFact()).toMatchObject({
      type: "delivery_purchase_bin_candidate.corrected",
      payload: { before: { maxStack: 5 }, after: { maxStack: 4 } },
    });
  });

  it("archive, réactive, refuse de réactiver ce qui est en cours", async () => {
    const w = world(existing("pbc_a", "Caisse Dupont 50"));

    await w.archive.execute(new ArchivePurchaseBinCandidateCommand("pbc_a", "staff_2"));
    await w.reactivate.execute(new ReactivatePurchaseBinCandidateCommand("pbc_a", "staff_2"));
    await expect(
      w.reactivate.execute(new ReactivatePurchaseBinCandidateCommand("pbc_a", "staff_2")),
    ).rejects.toThrow(PurchaseCandidateNotArchivedError);

    expect(w.events.factTypes()).toEqual([
      "delivery_purchase_bin_candidate.archived",
      "delivery_purchase_bin_candidate.reactivated",
    ]);
  });

  it("refuse un identifiant inconnu", async () => {
    const w = world();

    await expect(
      w.correct.execute(new CorrectPurchaseBinCandidateCommand("nope", CAISSE, "staff_2")),
    ).rejects.toThrow(PurchaseCandidateNotFoundError);
  });
});

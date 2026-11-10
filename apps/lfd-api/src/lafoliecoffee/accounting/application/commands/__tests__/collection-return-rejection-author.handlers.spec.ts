import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  RECORDED_AT,
  returnableLine,
} from "../../../domain/entities/__tests__/collection-return-fixtures.js";
import { ReturnOnRejectedBatchError } from "../../../domain/errors/collection-return-errors.js";
import { RecordCollectionReturnCommand } from "../record-collection-return.command.js";
import { returnWorld } from "./collection-return-doubles.js";

const REJECTED = returnableLine({
  batchStatus: "rejected_by_bank",
  batchRejection: { at: RECORDED_AT, reason: "PSR1 : fichier refusé", byStaffId: "staff_compta" },
});

function rejectAm04(): RecordCollectionReturnCommand {
  return new RecordCollectionReturnCommand(
    "lot_1",
    1,
    "reject",
    "AM04",
    null,
    "2026-10-16",
    750,
    "staff_1",
  );
}

/**
 * Le refus d'un retour sur un lot rejeté par la banque nomme qui a déclaré
 * le rejet (décision de Hugo, 2026-10-23) : la personne à qui demander si la
 * banque a vraiment refusé le fichier.
 */
describe("un retour sur un lot rejeté nomme l'auteur du rejet", () => {
  it("nomme la personne de l'annuaire, avec la date et le motif", async () => {
    const authors = new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Claire", lastName: "Compta" }, "staff_compta"),
    );
    const w = returnWorld(REJECTED, authors);

    const refusal = w.record.execute(rejectAm04());

    await expect(refusal).rejects.toThrow(ReturnOnRejectedBatchError);
    await expect(refusal).rejects.toThrow(
      /rejeté par la banque par Claire Compta le 12 octobre 2026 \(motif : « PSR1 : fichier refusé »\)/u,
    );
    expect(authors.asked).toEqual([["staff_compta"]]);
  });

  it("une référence que l'annuaire ne connaît plus se dit « un membre de l'équipe »", async () => {
    const w = returnWorld(REJECTED);

    await expect(w.record.execute(rejectAm04())).rejects.toThrow(
      /par un membre de l'équipe le 12 octobre 2026/u,
    );
  });

  it("n'interroge pas l'annuaire pour un retour qui s'enregistre", async () => {
    const w = returnWorld();

    await w.record.execute(rejectAm04());

    expect(w.authors.asked).toEqual([]);
  });
});

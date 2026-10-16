import {
  CountingPimIds,
  RecordingDurable,
} from "../../../catalogue/product/application/__tests__/durable-doubles.js";
import { OperationsMovedToCommerceError } from "../../domain/errors/operation-errors.js";
import { ArchiveOperationCommand, ArchiveOperationHandler } from "../archive-operation.js";
import {
  ChangeOperationAudienceCommand,
  ChangeOperationAudienceHandler,
} from "../change-operation-audience.js";
import { EditOperationCommand, EditOperationHandler } from "../edit-operation.js";
import { PrepareOperationCommand, PrepareOperationHandler } from "../prepare-operation.js";
import { RescheduleOperationCommand, RescheduleOperationHandler } from "../reschedule-operation.js";
import {
  SetOperationSelectionCommand,
  SetOperationSelectionHandler,
} from "../set-operation-selection.js";
import { doubles, FixedReferentialWriting, prepared, type Doubles } from "./operation-doubles.js";

/**
 * **La bascule ferme le référentiel** (lot 3 de
 * `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`) :
 * interrupteur `OPERATIONS_AT_COMMERCE` ouvert, chaque geste refuse AVANT
 * toute lecture, et rien n'est écrit ni journalisé.
 */
function closed(): Doubles {
  return { ...doubles(), writing: new FixedReferentialWriting(false) };
}

const GESTURES: readonly (readonly [string, (d: Doubles) => Promise<unknown>])[] = [
  [
    "préparer",
    (d) =>
      new PrepareOperationHandler(d.operations, d.images, d.journal, d.uow, d.writing).execute(
        new PrepareOperationCommand(prepared()),
      ),
  ],
  [
    "éditer",
    (d) =>
      new EditOperationHandler(
        d.operations,
        d.images,
        d.journal,
        d.uow,
        new RecordingDurable(),
        new CountingPimIds(),
        d.writing,
      ).execute(
        new EditOperationCommand("noel-2026", { name: { fr: "N" }, lede: null, image: null }),
      ),
  ],
  [
    "replanifier",
    (d) =>
      new RescheduleOperationHandler(d.operations, d.journal, d.uow, d.writing).execute(
        new RescheduleOperationCommand("noel-2026", prepared()),
      ),
  ],
  [
    "changer la clientèle",
    (d) =>
      new ChangeOperationAudienceHandler(d.operations, d.journal, d.uow, d.writing).execute(
        new ChangeOperationAudienceCommand("noel-2026", "pro"),
      ),
  ],
  [
    "choisir la sélection",
    (d) =>
      new SetOperationSelectionHandler(d.operations, d.skus, d.journal, d.uow, d.writing).execute(
        new SetOperationSelectionCommand("noel-2026", []),
      ),
  ],
  [
    "archiver",
    (d) =>
      new ArchiveOperationHandler(d.operations, d.journal, d.clock, d.uow, d.writing).execute(
        new ArchiveOperationCommand("noel-2026"),
      ),
  ],
];

describe("les opérations passées au commerce, le référentiel refuse", () => {
  it.each(GESTURES)("%s : 409 moved_to_commerce, rien d'écrit ni de tracé", async (_, gesture) => {
    const d = closed();

    await expect(gesture(d)).rejects.toThrow(OperationsMovedToCommerceError);

    expect(d.journal.entries).toEqual([]);
  });
});

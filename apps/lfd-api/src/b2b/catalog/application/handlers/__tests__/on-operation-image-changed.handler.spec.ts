import {
  OperationImageChangedFact,
  PIM_OPERATION_IMAGE_CHANGED,
} from "../../../../../pim/channels/b2b-platform/operations/operation-image-changed.fact.js";
import { OnOperationImageChangedHandler } from "../on-operation-image-changed.handler.js";

/**
 * Depuis X1 (2026-10-17, `plan-sans-interrupteurs.md`) : l'image d'une
 * opération est celle du commerce ; le fait du référentiel n'a plus de
 * destinataire, et l'abonné l'acquitte sans lever — même illisible, lever
 * ferait rejouer sans fin.
 */
describe("OnOperationImageChanged", () => {
  it("acquitte un fait du référentiel sans lever", async () => {
    const fact = new OperationImageChangedFact("noel", "geste_9", null).durableFact();

    await expect(
      new OnOperationImageChangedHandler().handle({ eventId: "evt_1", ...fact }),
    ).resolves.toBeUndefined();
  });

  it("acquitte aussi un payload illisible", async () => {
    await expect(
      new OnOperationImageChangedHandler().handle({
        eventId: "evt_1",
        type: PIM_OPERATION_IMAGE_CHANGED,
        payload: { operationKey: "noel" },
      }),
    ).resolves.toBeUndefined();
  });
});

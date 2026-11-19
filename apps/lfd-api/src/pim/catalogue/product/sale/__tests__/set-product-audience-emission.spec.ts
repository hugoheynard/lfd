import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import {
  Timeline,
  TimelineEmitter,
  TimelineUnitOfWork,
} from "../../../../shared/__tests__/timeline-doubles.js";
import { OneProduct, PRODUCT_ID, tarte } from "../../shared/__tests__/audience-doubles.js";
import { SetProductAudienceCommand, SetProductAudienceHandler } from "../set-product-audience.js";

/**
 * **Où** un geste émet (2a3, C4) : la fiche DANS sa transaction, en dernière
 * instruction ; les fiches d'une famille APRÈS la transaction du geste, une
 * par une — jamais toutes sous le verrou du geste. L'e2e éprouve ce qui part
 * réellement.
 */
describe("l'émission des faits du catalogue, vue d'un geste sur une fiche", () => {
  it("une fiche s'émet en dernière instruction de SA transaction", async () => {
    const timeline = new Timeline();

    await new SetProductAudienceHandler(
      new OneProduct(tarte()),
      new RecordingJournal(),
      new TimelineUnitOfWork(timeline),
      new TimelineEmitter(timeline),
    ).execute(new SetProductAudienceCommand(PRODUCT_ID, "pro"));

    expect(timeline.events).toEqual(["begin", `emit:product:${PRODUCT_ID}`, "commit"]);
  });
});

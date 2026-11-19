import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import {
  Timeline,
  TimelineEmitter,
  TimelineReemission,
  TimelineUnitOfWork,
} from "../../../../shared/__tests__/timeline-doubles.js";
import { CATEGORY_ID, OneCategory, family } from "./category-doubles.js";
import {
  SetCategoryAudienceCommand,
  SetCategoryAudienceHandler,
} from "../set-category-audience.js";

/**
 * **Où** un geste émet (2a3, C4) : la fiche DANS sa transaction, en dernière
 * instruction ; les fiches d'une famille APRÈS la transaction du geste, une
 * par une — jamais toutes sous le verrou du geste. L'e2e éprouve ce qui part
 * réellement.
 */
describe("l'émission des faits du catalogue, vue d'un geste sur une famille", () => {
  it("une famille s'émet dans sa transaction ; ses fiches APRÈS, hors du verrou du geste", async () => {
    const timeline = new Timeline();

    await new SetCategoryAudienceHandler(
      new OneCategory(family("both")),
      new RecordingJournal(),
      new TimelineUnitOfWork(timeline),
      new TimelineEmitter(timeline),
      new TimelineReemission(timeline),
    ).execute(new SetCategoryAudienceCommand(CATEGORY_ID, "pro"));

    expect(timeline.events).toEqual([
      "begin",
      `emit:category:${CATEGORY_ID}`,
      "commit",
      `reemit:family:${CATEGORY_ID}`,
    ]);
  });
});

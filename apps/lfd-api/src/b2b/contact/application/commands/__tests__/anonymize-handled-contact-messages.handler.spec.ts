import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { contactMessageKeptSince } from "../../../domain/contact-retention.js";
import {
  AnonymizeHandledContactMessagesHandler,
  CONTACT_ANONYMIZE_BATCH_SIZE,
} from "../anonymize-handled-contact-messages.handler.js";
import { ScriptedAnonymizer } from "./contact-doubles.js";

const NOW = new Date(0);

describe("AnonymizeHandledContactMessagesHandler", () => {
  it("enchaîne les lots pleins jusqu'au lot incomplet, à la frontière des douze mois", async () => {
    const anonymizer = new ScriptedAnonymizer([CONTACT_ANONYMIZE_BATCH_SIZE, 7]);
    const total = await new AnonymizeHandledContactMessagesHandler(
      anonymizer,
      new FixedClock(NOW),
    ).execute();

    expect(total).toBe(CONTACT_ANONYMIZE_BATCH_SIZE + 7);
    expect(anonymizer.calls).toHaveLength(2);
    expect(anonymizer.calls[0]).toEqual({
      before: contactMessageKeptSince(NOW),
      at: NOW,
      limit: CONTACT_ANONYMIZE_BATCH_SIZE,
    });
  });

  it("rend zéro quand rien n'est dû", async () => {
    const anonymizer = new ScriptedAnonymizer([]);
    expect(
      await new AnonymizeHandledContactMessagesHandler(anonymizer, new FixedClock(NOW)).execute(),
    ).toBe(0);
    expect(anonymizer.calls).toHaveLength(1);
  });
});

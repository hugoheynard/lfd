import type { AccessibilityFollowUpView } from "@lfd/contracts";

import { AccessibilityFollowUpReader } from "../../domain/accessibility-follow-up.reader.js";
import { GetAccessibilityFollowUpHandler } from "../get-accessibility-follow-up.handler.js";

const FOLLOW_UP: AccessibilityFollowUpView = {
  corrections: [
    {
      theme: 1,
      date: null,
      status: "planned",
      label: { fr: "Images", en: "Images", it: "Immagini" },
    },
  ],
  audit: { plannedFor: null, completedOn: null },
  conformity: null,
};

/** Double du port : rend un suivi fixe et compte ses lectures. */
class FixedFollowUpReader extends AccessibilityFollowUpReader {
  reads = 0;

  read(): AccessibilityFollowUpView {
    this.reads += 1;
    return FOLLOW_UP;
  }
}

describe("GetAccessibilityFollowUpHandler", () => {
  it("sert le suivi tel que le port le rend", async () => {
    const reader = new FixedFollowUpReader();
    await expect(new GetAccessibilityFollowUpHandler(reader).execute()).resolves.toBe(FOLLOW_UP);
    expect(reader.reads).toBe(1);
  });
});

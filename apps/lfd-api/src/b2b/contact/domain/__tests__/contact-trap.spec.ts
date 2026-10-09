import { CONTACT_MIN_FILL_MS } from "@lfd/contracts";

import { looksAutomated } from "../contact-trap.js";

describe("looksAutomated — le piège et le délai minimal", () => {
  it("laisse passer un humain : piège vide, saisie assez lente", () => {
    expect(looksAutomated({ website: "", elapsedMs: CONTACT_MIN_FILL_MS })).toBe(false);
  });

  it("écarte un piège rempli", () => {
    expect(looksAutomated({ website: "https://spam.example", elapsedMs: 60_000 })).toBe(true);
  });

  it("écarte une saisie plus rapide que le délai minimal", () => {
    expect(looksAutomated({ website: "", elapsedMs: CONTACT_MIN_FILL_MS - 1 })).toBe(true);
  });
});

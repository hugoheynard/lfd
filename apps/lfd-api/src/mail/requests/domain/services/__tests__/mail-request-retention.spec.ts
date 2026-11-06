import {
  isMailRequestPurgeable,
  MAIL_REQUEST_RETENTION_DAYS,
  mailRequestPurgeCutoff,
} from "../mail-request-retention.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * MS_PER_DAY);
const cutoff = mailRequestPurgeCutoff(NOW);

describe("isMailRequestPurgeable", () => {
  it("envoyée il y a plus d'un an : purgée", () => {
    expect(
      isMailRequestPurgeable({ status: "sent", sentAt: daysAgo(366), failedAt: null }, cutoff),
    ).toBe(true);
  });

  it("envoyée il y a moins d'un an : gardée", () => {
    expect(
      isMailRequestPurgeable({ status: "sent", sentAt: daysAgo(364), failedAt: null }, cutoff),
    ).toBe(false);
  });

  it("envoyée exactement à la frontière : gardée", () => {
    const at = daysAgo(MAIL_REQUEST_RETENTION_DAYS);
    expect(isMailRequestPurgeable({ status: "sent", sentAt: at, failedAt: null }, cutoff)).toBe(
      false,
    );
  });

  it("échouée ou refusée il y a plus d'un an : purgée, d'après failedAt", () => {
    for (const status of ["failed", "refused"] as const) {
      expect(isMailRequestPurgeable({ status, sentAt: null, failedAt: daysAgo(400) }, cutoff)).toBe(
        true,
      );
      expect(isMailRequestPurgeable({ status, sentAt: null, failedAt: daysAgo(10) }, cutoff)).toBe(
        false,
      );
    }
  });

  it("en attente (requested) : jamais purgée, même très ancienne", () => {
    expect(
      isMailRequestPurgeable(
        { status: "requested", sentAt: daysAgo(900), failedAt: daysAgo(900) },
        cutoff,
      ),
    ).toBe(false);
  });

  /** Régression (2026-11-06) : S1b a ajouté `sending`, que la purge ignorait. */
  it("en vol (sending) : jamais purgée, le balayeur peut encore la reprendre", () => {
    expect(
      isMailRequestPurgeable({ status: "sending", sentAt: null, failedAt: daysAgo(900) }, cutoff),
    ).toBe(false);
  });

  it("close sans date d'issue : gardée (on ne devine pas son âge)", () => {
    expect(isMailRequestPurgeable({ status: "sent", sentAt: null, failedAt: null }, cutoff)).toBe(
      false,
    );
  });
});

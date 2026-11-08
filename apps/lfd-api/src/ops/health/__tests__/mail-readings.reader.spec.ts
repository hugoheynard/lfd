import { AppConfig } from "../../../platform/config/app-config.js";
import {
  type MailDeliveryFigures,
  MailDeliveryTally,
} from "../../../platform/mailer/delivery-tally/mail-delivery-tally.js";
import { ResendWebhookChecker } from "../../../platform/mailer/webhook/resend-webhook.checker.js";
import type { DeclarationVerdict } from "../../../platform/mailer/webhook/webhook-declaration.js";
import { FixedClock } from "../../../platform/time/fixed-clock.js";
import { MailReadingsReader } from "../mail-readings.reader.js";

const NOW = new Date("2026-11-08T10:00:00.000Z");
const DAY_MS = 86_400_000;

/** Le suivi doublé : il rend son décompte, ou tombe, et note la fenêtre demandée. */
class FixedTally extends MailDeliveryTally {
  readonly asked: Date[] = [];
  failure: Error | null = null;
  constructor(private readonly figures: MailDeliveryFigures) {
    super();
  }
  read(since: Date): Promise<MailDeliveryFigures> {
    this.asked.push(since);
    return this.failure === null ? Promise.resolve(this.figures) : Promise.reject(this.failure);
  }
}

/** La déclaration du webhook, sans réseau. */
class FixedWebhook extends ResendWebhookChecker {
  constructor(private readonly verdict: DeclarationVerdict | null) {
    super(new AppConfig());
  }
  override check(): Promise<DeclarationVerdict | null> {
    return Promise.resolve(this.verdict);
  }
}

const FIGURES: MailDeliveryFigures = {
  awaitingReturn: 2,
  delayed: 0,
  delivered: 7,
  bounced: 2,
  complained: 1,
  mostRejectedTemplate: "customer.access-opened",
};

function reader(tally: FixedTally, verdict: DeclarationVerdict | null = null) {
  return new MailReadingsReader(tally, new FixedClock(NOW), new FixedWebhook(verdict));
}

describe("MailReadingsReader — la carte lit le suivi par son port (T1b)", () => {
  it("demande les sept derniers jours au Clock", async () => {
    const tally = new FixedTally(FIGURES);

    await reader(tally).read();

    expect(tally.asked).toEqual([new Date(NOW.getTime() - 7 * DAY_MS)]);
  });

  it("rend les envois, les rejets et le modèle le plus rejeté", async () => {
    const readings = await reader(new FixedTally(FIGURES)).read();

    expect(readings.map(({ label, value }) => ({ label, value }))).toEqual([
      { label: "Envoyés", value: 12 },
      { label: "Rejetés", value: 3 },
    ]);
    expect(readings[1]?.hint).toContain("customer.access-opened");
  });

  it("garde la déclaration du webhook devant, et seule si le suivi tombe", async () => {
    const tally = new FixedTally(FIGURES);
    tally.failure = new RangeError("base indisponible");

    const readings = await reader(tally, { healthy: true, active: 1, detail: "actif" }).read();

    expect(readings.map(({ label }) => label)).toEqual(["Retour"]);
  });
});

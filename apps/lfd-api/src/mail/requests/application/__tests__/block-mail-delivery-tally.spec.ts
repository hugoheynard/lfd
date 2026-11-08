import { MailProbeTemplates } from "../../../sends/domain/ports/mail-probe-templates.js";
import { MailDeliveryCountsReader } from "../../domain/ports/mail-delivery-counts.reader.js";
import type {
  MailDeliveryCounts,
  MailDeliveryCriteria,
  MailRejection,
} from "../../domain/services/mail-rejections.js";
import { BlockMailDeliveryTally } from "../block-mail-delivery-tally.js";

const SINCE = new Date("2026-11-01T10:00:00.000Z");
const COUNTS: MailDeliveryCounts = {
  awaitingReturn: 4,
  delayed: 1,
  delivered: 20,
  bounced: 3,
  complained: 0,
};

class FixedCounts extends MailDeliveryCountsReader {
  readonly asked: MailDeliveryCriteria[] = [];
  constructor(private readonly rejected: readonly MailRejection[]) {
    super();
  }
  counts(criteria: MailDeliveryCriteria): Promise<MailDeliveryCounts> {
    this.asked.push(criteria);
    return Promise.resolve(COUNTS);
  }
  rejections(criteria: MailDeliveryCriteria): Promise<readonly MailRejection[]> {
    this.asked.push(criteria);
    return Promise.resolve(this.rejected);
  }
}

class ProbeTemplates extends MailProbeTemplates {
  keys(): readonly string[] {
    return ["ops.deploy-check"];
  }
}

describe("BlockMailDeliveryTally — le suivi servi à la carte de santé (T1b)", () => {
  it("compte depuis la fenêtre demandée, la sonde exclue des deux lectures", async () => {
    const reader = new FixedCounts([]);

    await new BlockMailDeliveryTally(reader, new ProbeTemplates()).read(SINCE);

    expect(reader.asked).toEqual([
      { since: SINCE, exceptTemplates: ["ops.deploy-check"] },
      { since: SINCE, exceptTemplates: ["ops.deploy-check"] },
    ]);
  });

  it("rend les comptes et le modèle le plus rejeté en tête", async () => {
    const reader = new FixedCounts([
      { template: "customer.access-opened", count: 2, lastAt: SINCE },
      { template: "customer.order-ready", count: 1, lastAt: SINCE },
    ]);

    const figures = await new BlockMailDeliveryTally(reader, new ProbeTemplates()).read(SINCE);

    expect(figures).toEqual({ ...COUNTS, mostRejectedTemplate: "customer.access-opened" });
  });

  it("sans rejet, ne désigne aucun modèle", async () => {
    const figures = await new BlockMailDeliveryTally(
      new FixedCounts([]),
      new ProbeTemplates(),
    ).read(SINCE);

    expect(figures.mostRejectedTemplate).toBeNull();
  });
});

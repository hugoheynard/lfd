import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { collectionMeansAt } from "../../domain/services/collection-means-timeline.js";
import { paris } from "../../domain/services/__tests__/billing-mode-fixtures.js";
import { SELLER_FACTS } from "../../domain/entities/__tests__/invoice-fixtures.js";
import {
  ModeDatesStore,
  PayerModesStore,
  StoreModeDatesReader,
  StorePayerModesReader,
} from "../commands/__tests__/billing-mode-doubles.js";
import {
  InMemoryPayerMeans,
  PayerMeansStore,
  RecordingPayerLock,
} from "../commands/__tests__/collection-means-doubles.js";
import { FixedIssuers } from "../commands/__tests__/monthly-invoice-doubles.js";
import { COUNTER_PAYER_MEANS_REASON, CounterPayerOpener } from "../counter-payer-opener.js";

/** Horloge FIXE : les dates ne sont comparées qu'aux clôtures des doublures. */
const NOW = paris("2026-10-08", "11:00");
const KIOSK = { id: "cmp_kiosk", name: "Kiosque du Quai" };

function world() {
  const means = new PayerMeansStore();
  const events = new RecordingPublisher();
  const lock = new RecordingPayerLock();
  const opener = new CounterPayerOpener(
    new FixedIssuers([{ ...SELLER_FACTS, legalEntityId: "le1" }]),
    new StorePayerModesReader(new PayerModesStore()),
    new StoreModeDatesReader(new ModeDatesStore()),
    new InMemoryPayerMeans(means),
    lock,
    new FixedIdGenerator("seg"),
    events,
  );
  return { opener, means, events, lock };
}

describe("CounterPayerOpener — un compte ouvert au comptoir naît au virement (K2, § 3.2)", () => {
  it("pose le virement, motif « ouvert au comptoir », au nom de l'agent, sous le verrou du payeur", async () => {
    const w = world();

    await w.opener.open(KIOSK, NOW, "staff_agent");

    expect(collectionMeansAt(w.means.rows, NOW).means).toBe("bank_transfer");
    expect(w.means.rows).toEqual([
      expect.objectContaining({
        reason: COUNTER_PAYER_MEANS_REASON,
        createdByStaffId: "staff_agent",
        payerCompanyId: KIOSK.id,
      }),
    ]);
    expect(w.lock.locked).toEqual([KIOSK.id]);
    expect(w.events.traced.map((event) => event.journalFact().payload)).toEqual([
      expect.objectContaining({ to: "bank_transfer", immediate: true }),
    ]);
  });
});

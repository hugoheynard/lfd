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
  meansRow,
  PayerMeansStore,
  RecordingPayerLock,
} from "../commands/__tests__/collection-means-doubles.js";
import { FixedIssuers } from "../commands/__tests__/monthly-invoice-doubles.js";
import { PUBLIC_PAYER_MEANS_REASON, PublicPayerOpener } from "../public-payer-opener.js";

/** Le 8 octobre, horloge FIXE : dernière clôture du mensuel le 1er octobre, prochaine le 1er novembre. */
const NOW = paris("2026-10-08", "11:00");
const SCHOOL = { id: "cmp_school", name: "École du Mont-Blanc" };
const SECOND_ENTITY = { ...SELLER_FACTS, legalEntityId: "le2", name: "La Folie Douce Alpes" };

function world(input: { readonly prior?: PayerMeansStore["rows"] }) {
  const means = new PayerMeansStore();
  means.rows.push(...(input.prior ?? []));
  const events = new RecordingPublisher();
  const lock = new RecordingPayerLock();
  const opener = new PublicPayerOpener(
    new FixedIssuers([{ ...SELLER_FACTS, legalEntityId: "le1" }, SECOND_ENTITY]),
    new StorePayerModesReader(new PayerModesStore()),
    new StoreModeDatesReader(new ModeDatesStore()),
    new InMemoryPayerMeans(means),
    lock,
    new FixedIdGenerator("seg"),
    events,
  );
  return { opener, means, events, lock };
}

function meansAt(store: PayerMeansStore, legalEntityId: string, at: Date): string {
  const rows = store.rows.filter((row) => row.legalEntityId === legalEntityId);
  return collectionMeansAt(rows, at).means;
}

describe("PublicPayerOpener — activer un organisme public pose le virement (P1b, B2)", () => {
  it("pose le virement chez chaque entité en service, sous le verrou du payeur", async () => {
    const w = world({});

    await w.opener.open(SCHOOL, NOW, "staff_1");

    expect(meansAt(w.means, "le1", NOW)).toBe("bank_transfer");
    expect(meansAt(w.means, "le2", NOW)).toBe("bank_transfer");
    expect(w.means.rows.map((row) => row.reason)).toEqual([
      PUBLIC_PAYER_MEANS_REASON,
      PUBLIC_PAYER_MEANS_REASON,
    ]);
    expect(w.lock.locked).toEqual([SCHOOL.id]);
    expect(w.events.traced.map((event) => event.journalFact().payload)).toEqual([
      expect.objectContaining({ to: "bank_transfer", immediate: true }),
      expect.objectContaining({ to: "bank_transfer", immediate: true }),
    ]);
  });

  it("remplace un prélèvement posé avant la dernière clôture, dès l'activation", async () => {
    const w = world({ prior: [meansRow(SCHOOL.id, "sepa_debit", paris("2026-09-01"))] });

    await w.opener.open(SCHOOL, NOW, "staff_1");

    expect(meansAt(w.means, "le1", NOW)).toBe("bank_transfer");
  });

  it("un prélèvement posé depuis la dernière clôture est annulé : le virement vaut dès l'activation", async () => {
    const w = world({ prior: [meansRow(SCHOOL.id, "sepa_debit", paris("2026-10-01"))] });

    await w.opener.open(SCHOOL, NOW, "staff_1");

    expect(meansAt(w.means, "le1", NOW)).toBe("bank_transfer");
    expect(w.means.rows.find((row) => row.means === "sepa_debit")?.cancelledAt).toEqual(NOW);
  });

  it("n'écrit rien chez une entité où le virement est déjà le moyen", async () => {
    const w = world({ prior: [meansRow(SCHOOL.id, "bank_transfer", paris("2026-09-01"))] });

    await w.opener.open(SCHOOL, NOW, "staff_1");

    expect(w.means.rows.filter((row) => row.legalEntityId === "le1")).toHaveLength(1);
    expect(meansAt(w.means, "le2", NOW)).toBe("bank_transfer");
  });

  it("annule un prélèvement programmé au lieu de refuser l'activation", async () => {
    const scheduled = {
      ...meansRow(SCHOOL.id, "sepa_debit", paris("2026-11-01")),
      createdAt: paris("2026-10-06"),
    };
    const w = world({ prior: [scheduled] });

    await w.opener.open(SCHOOL, NOW, "staff_1");

    expect(meansAt(w.means, "le1", NOW)).toBe("bank_transfer");
    expect(meansAt(w.means, "le1", paris("2026-11-02"))).toBe("bank_transfer");
  });
});

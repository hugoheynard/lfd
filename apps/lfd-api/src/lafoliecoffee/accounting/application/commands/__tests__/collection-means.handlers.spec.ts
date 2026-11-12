import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { BillingPayerNotFoundError } from "../../../domain/errors/billing-mode-errors.js";
import {
  CollectionMeansReturnPendingError,
  NoScheduledCollectionMeansError,
  NotACollectionMeansPayerError,
} from "../../../domain/errors/collection-means-errors.js";
import { InvalidCollectionMeansError } from "../../../domain/errors/invalid-collection-means.error.js";
import { paris } from "../../../domain/services/__tests__/billing-mode-fixtures.js";
import { GetPayerCollectionMeansHandler } from "../../queries/get-payer-collection-means.handler.js";
import { GetPayerCollectionMeansQuery } from "../../queries/get-payer-collection-means.query.js";
import { CancelPayerCollectionMeansCommand } from "../cancel-payer-collection-means.command.js";
import { CancelPayerCollectionMeansHandler } from "../cancel-payer-collection-means.handler.js";
import { SetPayerCollectionMeansCommand } from "../set-payer-collection-means.command.js";
import { SetPayerCollectionMeansHandler } from "../set-payer-collection-means.handler.js";
import {
  FixedOrderHistory,
  FixedStandings,
  ModeDatesStore,
  PAYER,
  PayerModesStore,
  StoreModeDatesReader,
  StorePayerModesReader,
} from "./billing-mode-doubles.js";
import {
  FixedPendingReturns,
  InMemoryPayerMeans,
  OnlyLe1,
  PayerMeansStore,
  StorePayerMeansReader,
} from "./collection-means-doubles.js";
import { declaredEntity, SettingSteps, StepEntities } from "./mandate-setting-doubles.js";

/** Le 8 octobre 2026, horloge FIXE : la prochaine clôture du mensuel est le 1er novembre. */
const NOW = paris("2026-10-08", "11:00");
const REASON = "Demande écrite du client";

const SITE = {
  companyId: "cmp_site",
  name: "Site Annexe",
  active: true,
  follows: [
    {
      companyId: "cmp_site",
      payerId: PAYER.companyId,
      payerName: PAYER.name,
      validFrom: paris("2026-09-01"),
      validTo: null,
    },
  ],
};
const NEWCOMER = { companyId: "cmp_new", name: "Le Nouveau", active: true, follows: [] };
const RETURNED = { companyId: "cmp_ret", name: "Le Rejeté", active: true, follows: [] };

function world() {
  const entities = new StepEntities(new SettingSteps());
  entities.rows.set("le1", declaredEntity());
  const means = new PayerMeansStore();
  const modes = new PayerModesStore();
  const dates = new ModeDatesStore();
  const clock = new FixedClock(NOW);
  const events = new RecordingPublisher();
  const standings = new FixedStandings([PAYER, SITE, NEWCOMER, RETURNED]);
  return {
    means,
    modes,
    events,
    set: new SetPayerCollectionMeansHandler(
      entities,
      standings,
      new StoreModeDatesReader(dates),
      new StorePayerModesReader(modes),
      new InMemoryPayerMeans(means),
      new FixedOrderHistory(new Set([PAYER.companyId, RETURNED.companyId])),
      new FixedPendingReturns(new Set([RETURNED.companyId])),
      clock,
      new FixedIdGenerator("seg"),
      events,
      new DirectUnitOfWork(),
    ),
    cancel: new CancelPayerCollectionMeansHandler(
      entities,
      standings,
      new InMemoryPayerMeans(means),
      clock,
      events,
      new DirectUnitOfWork(),
    ),
    read: new GetPayerCollectionMeansHandler(
      new OnlyLe1(),
      standings,
      new StorePayerMeansReader(means),
      clock,
    ),
  };
}

const toTransfer = (companyId: string, reason = REASON) =>
  new SetPayerCollectionMeansCommand("le1", companyId, "bank_transfer", reason, "staff_1");

describe("SetPayerCollectionMeansHandler", () => {
  it("programme le virement d'un payeur qui a commandé, et le journalise sur lui", async () => {
    const w = world();

    await w.set.execute(toTransfer(PAYER.companyId));

    expect(w.means.rows).toHaveLength(1);
    expect(w.means.rows[0]).toMatchObject({
      payerCompanyId: PAYER.companyId,
      means: "bank_transfer",
      effectiveFrom: paris("2026-11-01"),
      reason: REASON,
      createdByStaffId: "staff_1",
    });
    const fact = w.events.traced[0]?.journalFact();
    expect(fact).toMatchObject({
      type: "payer.collection_means_changed",
      subjectId: PAYER.companyId,
    });
    expect(fact?.payload).toEqual({
      subjectLabel: "Le Bistrot",
      legalEntity: { id: "le1", name: "La Folie Douce" },
      from: "sepa_debit",
      to: "bank_transfer",
      effectiveAt: paris("2026-11-01").toISOString(),
      cancelled: false,
      immediate: false,
      reason: REASON,
    });
  });

  it("se date sur les clôtures du MODE du payeur — hebdomadaire : le lundi suivant", async () => {
    const w = world();
    w.modes.rows.push({
      id: "m1",
      legalEntityId: "le1",
      payerCompanyId: PAYER.companyId,
      effectiveFrom: paris("2026-10-01"),
      mode: "weekly",
      createdAt: paris("2026-09-20"),
      createdByStaffId: "s",
      cancelledAt: null,
      cancelledByStaffId: null,
    });

    await w.set.execute(toTransfer(PAYER.companyId));

    expect(w.means.rows[0]?.effectiveFrom).toEqual(paris("2026-10-12"));
    // Le moyen n'entre pas dans le mode : aucun segment de mode n'est écrit.
    expect(w.modes.rows).toHaveLength(1);
  });

  it("un payeur qui n'a jamais commandé passe au virement tout de suite", async () => {
    const w = world();
    await w.set.execute(toTransfer(NEWCOMER.companyId));

    expect(w.means.rows[0]?.effectiveFrom).toEqual(paris("2026-10-01"));
    expect(w.events.traced[0]?.journalFact().payload).toMatchObject({ immediate: true });
    expect(
      await w.read.execute(new GetPayerCollectionMeansQuery("le1", NEWCOMER.companyId)),
    ).toMatchObject({
      means: "bank_transfer",
      since: paris("2026-10-01").toISOString(),
      scheduled: null,
    });
  });

  it("le même moyen redemandé : ni écriture ni fait", async () => {
    const w = world();
    await w.set.execute(
      new SetPayerCollectionMeansCommand("le1", PAYER.companyId, "sepa_debit", REASON, "s"),
    );
    await w.set.execute(toTransfer(PAYER.companyId));
    await w.set.execute(toTransfer(PAYER.companyId));

    expect(w.means.saves).toBe(1);
    expect(w.events.factTypes()).toHaveLength(1);
  });

  it("refuse pendant un retour bancaire en cours, sans rien écrire", async () => {
    const w = world();
    await expect(w.set.execute(toTransfer(RETURNED.companyId))).rejects.toThrow(
      CollectionMeansReturnPendingError,
    );
    expect(w.means.rows).toHaveLength(0);
    expect(w.events.factTypes()).toEqual([]);
  });

  it("refuse un site qui suit son principal, un compte inconnu, un moyen inconnu", async () => {
    const w = world();
    await expect(w.set.execute(toTransfer(SITE.companyId))).rejects.toThrow(
      NotACollectionMeansPayerError,
    );
    await expect(w.set.execute(toTransfer("ghost"))).rejects.toThrow(BillingPayerNotFoundError);
    await expect(
      w.set.execute(
        new SetPayerCollectionMeansCommand("le1", PAYER.companyId, "cheque", REASON, "s"),
      ),
    ).rejects.toThrow(InvalidCollectionMeansError);
    expect(w.means.rows).toHaveLength(0);
  });
});

describe("CancelPayerCollectionMeansHandler", () => {
  it("annule le programmé : garde la ligne, pose l'annulation, journalise `cancelled`", async () => {
    const w = world();
    await w.set.execute(toTransfer(PAYER.companyId));

    await w.cancel.execute(
      new CancelPayerCollectionMeansCommand("le1", PAYER.companyId, "staff_2"),
    );

    expect(w.means.rows).toHaveLength(1);
    expect(w.means.rows[0]).toMatchObject({ cancelledAt: NOW, cancelledByStaffId: "staff_2" });
    expect(w.events.traced[1]?.journalFact().payload).toMatchObject({
      from: "bank_transfer",
      to: "sepa_debit",
      cancelled: true,
      reason: null,
    });
  });

  it("refuse d'annuler quand rien n'est programmé", async () => {
    await expect(
      world().cancel.execute(new CancelPayerCollectionMeansCommand("le1", PAYER.companyId, "s")),
    ).rejects.toThrow(NoScheduledCollectionMeansError);
  });
});

describe("GetPayerCollectionMeansHandler", () => {
  it("prélèvement par défaut, et le programmé avec son motif", async () => {
    const w = world();
    const query = new GetPayerCollectionMeansQuery("le1", PAYER.companyId);
    expect(await w.read.execute(query)).toEqual({
      legalEntityId: "le1",
      companyId: PAYER.companyId,
      payerCompanyId: PAYER.companyId,
      followsPayer: null,
      means: "sepa_debit",
      since: null,
      scheduled: null,
    });

    await w.set.execute(toTransfer(PAYER.companyId));

    expect((await w.read.execute(query)).scheduled).toEqual({
      means: "bank_transfer",
      effectiveAt: paris("2026-11-01").toISOString(),
      reason: REASON,
    });
  });

  it("un site qui suit son principal lit le moyen du principal (V1)", async () => {
    const w = world();
    await w.set.execute(toTransfer(PAYER.companyId));
    expect(
      await w.read.execute(new GetPayerCollectionMeansQuery("le1", SITE.companyId)),
    ).toMatchObject({
      companyId: SITE.companyId,
      payerCompanyId: PAYER.companyId,
      followsPayer: { id: PAYER.companyId, name: PAYER.name },
      scheduled: { means: "bank_transfer" },
    });
  });
});

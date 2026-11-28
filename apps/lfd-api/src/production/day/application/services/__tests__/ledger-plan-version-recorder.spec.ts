import { producibleOrder } from "../../../../channels/commerce/__tests__/producible-order.fixture.js";
import type { PlanVersionAuthor } from "../../../domain/entities/plan-version.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { PlanVersionOutOfSequenceError } from "../../../domain/errors/plan-version-errors.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import {
  FixedWithdrawalsAfterInscription,
  PlanVersionStore,
  RequestedPapers,
  StoredDays,
  VersionLedgerDown,
  planVersionRecorder,
} from "./plan-version-doubles.js";

/**
 * L'écrivain des versions (`documentation/fournil/les-versions-du-plan.md`) : la journée prend son numéro avant le `save`, la
 * version s'ajoute après, et rien ne s'écrit quand le plan n'a pas changé.
 * Dates recopiées et comparées entre elles seulement — exception du §5.
 */

const DAY = ServiceDay.of("2026-11-28");
const EVENING = new Date("2026-11-27T18:00:00.000Z");
const NIGHT = new Date("2026-11-27T21:00:00.000Z");
const MARIE: PlanVersionAuthor = { kind: "staff", staffId: "staff-1", name: "Marie Dupont" };

function closedDay(): ProductionDay {
  const day = ProductionDay.open(DAY);
  day.close([producibleOrder("ord_1"), producibleOrder("ord_2")], new Set(), EVENING, null);
  return day;
}

describe("LedgerPlanVersionRecorder", () => {
  it("numérote la journée, la sauve, puis ajoute la version — le même numéro des deux côtés", async () => {
    const day = closedDay();
    const days = new StoredDays(day);
    const store = new PlanVersionStore();

    await planVersionRecorder(days, store).save(day, "closed", MARIE);

    expect(days.saves).toBe(1);
    expect(days.current.planVersion).toBe(1);
    expect(store.appended.map((version) => version.version)).toEqual([1]);
    expect(store.appended[0]?.toRecord()).toMatchObject({
      serviceDay: DAY.value,
      cause: "closed",
      recordedBy: MARIE,
      closedAt: EVENING,
      printRun: 1,
      contentVersion: 1,
    });
  });

  it("le plan n'a pas changé : la journée est sauvée, sans version ni numéro neuf", async () => {
    const day = closedDay();
    const days = new StoredDays(day);
    const store = new PlanVersionStore();
    const recorder = planVersionRecorder(days, store);
    await recorder.save(day, "closed", MARIE);

    await recorder.save(day, "order_revised", MARIE);

    expect(days.saves).toBe(2);
    expect(days.current.planVersion).toBe(1);
    expect(store.appended).toHaveLength(1);
  });

  it("une journée qui n'est pas arrêtée : sauvée, sans version", async () => {
    const day = ProductionDay.open(DAY);
    const days = new StoredDays(day);
    const store = new PlanVersionStore();

    await planVersionRecorder(days, store).save(day, "order_withdrawn", { kind: "customer" });

    expect(store.appended).toEqual([]);
    expect(days.current.planVersion).toBeNull();
  });

  it("le retrait que le geste fait porte son auteur ; les autres n'en inventent pas", async () => {
    const day = closedDay();
    const store = new PlanVersionStore();
    const withdrawals = new FixedWithdrawalsAfterInscription([
      { orderId: "ord_1", at: NIGHT },
      { orderId: "ord_2", at: NIGHT },
    ]);

    await planVersionRecorder(new StoredDays(day), store, withdrawals).save(
      day,
      "order_withdrawn",
      { kind: "guest" },
      "ord_2",
    );

    expect(store.appended[0]?.content.withdrawn.map((entry) => [entry.orderId, entry.by])).toEqual([
      ["ord_1", null],
      ["ord_2", { kind: "guest" }],
    ]);
  });

  /** § 2 bis point 1 : la trace ne doit pas pouvoir manquer. */
  it("un échec de l'ajout de la version fait échouer le geste", async () => {
    const day = closedDay();
    const store = new PlanVersionStore();
    store.failing = true;

    await expect(
      planVersionRecorder(new StoredDays(day), store).save(day, "closed", MARIE),
    ).rejects.toThrow(VersionLedgerDown);
  });

  it("une journée dont le numéro ne suit pas la dernière version : le geste échoue, rien n'est sauvé", async () => {
    const day = ProductionDay.fromSnapshot({ ...closedDay().toSnapshot(), planVersion: 4 });
    const days = new StoredDays(day);

    await expect(
      planVersionRecorder(days, new PlanVersionStore()).save(day, "closed", MARIE),
    ).rejects.toThrow(PlanVersionOutOfSequenceError);
    expect(days.saves).toBe(0);
  });

  describe("le papier de la version (§ 1.11, § 1.14)", () => {
    it("une version écrite demande son papier, la journée portant déjà son numéro", async () => {
      const day = closedDay();
      const papers = new RequestedPapers();
      const recorder = planVersionRecorder(
        new StoredDays(day),
        new PlanVersionStore(),
        undefined,
        undefined,
        papers,
      );

      await recorder.save(day, "closed", MARIE);

      expect(papers.versions).toEqual([1]);
    });

    it("un plan inchangé ne demande aucun papier", async () => {
      const day = closedDay();
      const papers = new RequestedPapers();
      const store = new PlanVersionStore();
      const recorder = planVersionRecorder(
        new StoredDays(day),
        store,
        undefined,
        undefined,
        papers,
      );
      await recorder.save(day, "closed", MARIE);

      await recorder.save(day, "order_revised", MARIE);

      expect(papers.versions).toEqual([1]);
    });

    it("un retrait écrit sa version mais pas de papier : il n'en a pas de propre", async () => {
      const day = closedDay();
      const papers = new RequestedPapers();
      const store = new PlanVersionStore();
      const withdrawals = new FixedWithdrawalsAfterInscription();
      const recorder = planVersionRecorder(
        new StoredDays(day),
        store,
        withdrawals,
        undefined,
        papers,
      );
      await recorder.save(day, "closed", MARIE);
      withdrawals.entries = [{ orderId: "ord_2", at: NIGHT }];

      await recorder.save(day, "order_withdrawn", { kind: "guest" }, "ord_2");

      expect(store.appended.map((version) => version.version)).toEqual([1, 2]);
      expect(papers.versions).toEqual([1]);
    });

    it("une version que le registre refuse ne demande pas de papier", async () => {
      const day = closedDay();
      const papers = new RequestedPapers();
      const store = new PlanVersionStore();
      store.failing = true;

      await expect(
        planVersionRecorder(new StoredDays(day), store, undefined, undefined, papers).save(
          day,
          "closed",
          MARIE,
        ),
      ).rejects.toThrow(VersionLedgerDown);
      expect(papers.versions).toEqual([]);
    });
  });
});

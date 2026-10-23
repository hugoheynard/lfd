/**
 * E2E de la procédure de prélèvement — **la liste des procédures**
 *
 * Découpé de `collection-procedure.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `collection-procedure-scene.ts`.
 */
import type { CollectionProcedureListView, CollectionProcedureView } from "@lfd/contracts";
import { cycleToConstitute } from "../src/b2b/accounting/domain/services/billing-cycle.js";
import { jsonBody } from "./e2e-harness.js";
import {
  ctx,
  entity,
  mandated,
  staff,
  useCollectionProcedureScene,
} from "./collection-procedure-scene.js";

useCollectionProcedureScene();

describe("la procédure de prélèvement — la liste des procédures", () => {
  function listOf(entityId: string, includeClosed = false): string {
    const closed = includeClosed ? "&includeClosed=true" : "";
    return `/admin/accounting/collection-procedures?legalEntityId=${entityId}${closed}`;
  }

  it("liste la clôture à préparer et la prochaine du mensuel, et ouvre chacune par son id", async () => {
    const entityId = await entity("552100554");
    await mandated(entityId, "Café de l'Isère");

    const list = jsonBody<CollectionProcedureListView>(
      await staff().get(listOf(entityId, true)).expect(200),
    );

    expect(list.rows.map((row) => row.phase)).toEqual(["open", "upcoming"]);
    expect(list.rows.every((row) => row.id.startsWith(`${entityId}~`))).toBe(true);
    expect(list.rows[0]).toMatchObject({ stage: "accounts", followedBatchId: null });
    expect(list.rows[0]?.warnings).toContainEqual({ code: "accounts_to_export", count: 1 });

    const [open, upcoming] = list.rows;
    const opened = jsonBody<CollectionProcedureView>(
      await staff()
        .get(`/admin/accounting/collection-procedure?procedureId=${open?.id ?? ""}`)
        .expect(200),
    );
    expect(opened.toPrepare?.procedureId).toBe(open?.id);
    const ahead = jsonBody<CollectionProcedureView>(
      await staff()
        .get(`/admin/accounting/collection-procedure?procedureId=${upcoming?.id ?? ""}`)
        .expect(200),
    );
    expect(ahead.toPrepare).toBeNull();
    // Le code court se calcule du jour de clôture et des rythmes ; le détail dit le même.
    for (const [row, view] of [
      [open, opened],
      [upcoming, ahead],
    ] as const) {
      const day = (row?.closureDay ?? "").slice(2).replaceAll("-", "");
      expect(row?.code).toBe(`PRL-${day}-M`);
      expect(row?.closureModes).toEqual(["monthly"]);
      expect(view.procedure).toMatchObject({
        code: row?.code,
        closureDay: row?.closureDay,
        closureModes: ["monthly"],
        payerCounts: null,
      });
      expect(view.procedureBatches).toEqual([]);
    }
  });

  /**
   * Une clôture manquée (R4b) : l'automatisme a tenté l'avant-avant-dernière,
   * jamais l'avant-dernière, et aucun lot ne la couvre. Tentative écrite par
   * Prisma, comme `collection-autopilot-outcome.e2e-spec.ts` : la produire par le
   * passage demanderait de remonter l'horloge d'un mois.
   */
  it("met la clôture manquée en tête, et son détail renvoie au lot de la dernière", async () => {
    const entityId = await entity("552100554");
    const before = jsonBody<CollectionProcedureListView>(
      await staff().get(listOf(entityId)).expect(200),
    );
    const latest = before.rows.find((row) => row.phase === "open");
    const previous = cycleToConstitute(new Date(Date.parse(latest?.closesAt ?? "") - 1), null);
    const attempted = cycleToConstitute(new Date(previous.closesAt.getTime() - 1), null).closesAt;
    await ctx.prisma.collectionFloor.upsert({
      where: { id: true },
      update: { floorAt: new Date(attempted.getTime() - 1) },
      create: { id: true, floorAt: new Date(attempted.getTime() - 1) },
    });
    await ctx.prisma.collectionAutopilotRun.create({
      data: {
        legalEntityId: entityId,
        cycleClosesAt: attempted,
        ranAt: attempted,
        outcome: "nothing_to_collect",
      },
    });

    const list = jsonBody<CollectionProcedureListView>(
      await staff().get(listOf(entityId)).expect(200),
    );
    const [missed] = list.rows;
    expect(missed).toMatchObject({ phase: "missed", closesAt: previous.closesAt.toISOString() });
    expect(missed?.warnings).toEqual([{ code: "missed_closure", count: null }]);

    const detail = jsonBody<CollectionProcedureView>(
      await staff()
        .get(`/admin/accounting/collection-procedure?procedureId=${missed?.id ?? ""}`)
        .expect(200),
    );
    expect(detail.missed?.latestProcedureId).toBe(latest?.id);
    expect(detail.toPrepare).toBeNull();
  });

  it("refuse (404) une entité inconnue, et une adresse de procédure illisible", async () => {
    await staff().get(listOf("le_inconnue")).expect(404);
    await staff()
      .get("/admin/accounting/collection-procedure?procedureId=n_importe_quoi")
      .expect(404);
  });
});

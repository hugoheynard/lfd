/**
 * E2E de la procédure de prélèvement — **les plafonds de la banque** sur
 * l'onglet 3 (plan `plan-plafonds-de-la-banque.md`, PL2). Ce que seule la
 * base prouve : les plafonds relus sur l'entité, et le cumul sommé sur les
 * lignes rangées des lots de l'entité.
 */
import type { CollectionProcedureView } from "@lfd/contracts";
import { daysAgo, jsonBody } from "./e2e-harness.js";
import {
  entity,
  lotCarrying,
  mandated,
  procedureOf,
  staff,
  useCollectionProcedureScene,
} from "./collection-procedure-scene.js";

useCollectionProcedureScene();

const LIMITS = "bank-collection-limits";

async function readFile(
  entityId: string,
  batchId: string,
): Promise<CollectionProcedureView["file"]> {
  return jsonBody<CollectionProcedureView>(
    await staff().get(procedureOf(entityId, batchId)).expect(200),
  ).file;
}

describe("l'onglet 3 compare le lot suivi aux plafonds de la banque (PL2)", () => {
  it("sans plafond renseigné : aucun constat, quel que soit le montant", async () => {
    const entityId = await entity("552100554");
    const reference = await mandated(entityId, "Café de l'Isère");
    const batchId = await lotCarrying(entityId, reference, { amountCents: 9_000_000 });

    expect((await readFile(entityId, batchId)).bankLimits).toEqual({
      batchId,
      scheme: "B2B",
      perDebit: [],
      perRemittance: null,
      monthly: null,
    });
  });

  it("au-dessus des trois plafonds : le débiteur, le total et le cumul du mois d'échéance", async () => {
    const entityId = await entity("552100554");
    const reference = await mandated(entityId, "Café de l'Isère");
    // L'échéance est relative : un mois civil commun aux deux lots, quel que soit le jour.
    const dueDay = daysAgo(-10).slice(0, 10);
    const batchId = await lotCarrying(entityId, reference, {
      amountCents: 80_000,
      requestedCollectionDay: dueDay,
    });
    await lotCarrying(entityId, reference, {
      id: "01JBQ7Z5K8M3QT9P2X4BPROC01",
      status: "deposited",
      amountCents: 50_000,
      requestedCollectionDay: dueDay,
    });
    await staff()
      .put(`/admin/accounting/legal-entities/${entityId}/${LIMITS}`)
      .send({
        scheme: "B2B",
        perDebitCents: 60_000,
        perRemittanceCents: 70_000,
        monthlyCents: 120_000,
      })
      .expect(204);

    const file = await readFile(entityId, batchId);

    expect(file.bankLimits).toEqual({
      batchId,
      scheme: "B2B",
      perDebit: [
        { rank: 1, debtorName: "Café de l'Isère", amountCents: 80_000, limitCents: 60_000 },
      ],
      perRemittance: { totalCents: 80_000, limitCents: 70_000 },
      monthly: {
        month: dueDay.slice(0, 7),
        totalCents: 130_000,
        limitCents: 120_000,
        batchCount: 2,
      },
    });
    // Un avertissement : l'onglet ne se ferme pas.
    expect(file.state).not.toBe("locked");
  });
});

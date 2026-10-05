import type { PurgeClient, ScenarioScope } from "./scenario-scope.js";

/**
 * **Le fournil et le retrait du scénario** — les journées du scénario avec
 * leurs plans, fiches et comptes (en cascade depuis la journée), leurs
 * fournées, remises et demandes de retour, leur journal `day_change`, et ce
 * que le retrait a attesté sur ses commandes (remises, départs, preuves).
 *
 * ## Une journée entière, et pas seulement ses lignes du scénario
 *
 * Un plan est un instantané **par journée**, tous clients confondus. En vider
 * la moitié laisserait un compte à produire qui annonce plus que ses fiches —
 * un chiffre faux, pire qu'une table vide. La journée part donc entière ; la
 * borne est la journée du scénario, plus « tout le fournil » comme jusqu'au
 * 2026-10-05.
 *
 * Les fournées, remises et retours tiennent la journée en `Restrict` : ils
 * partent avant elle. Les contrôles qualité ne sont pas touchés — le scénario
 * n'en pose aucun.
 *
 * @returns les lignes supprimées, et les clés de preuve de retrait des
 *   commandes du scénario (leurs objets sont rangés dans le stockage).
 */
export async function purgeProduction(
  tx: PurgeClient,
  scope: ScenarioScope,
): Promise<{ readonly rows: number; readonly proofKeys: readonly string[] }> {
  const ofDays = { serviceDay: { in: [...scope.days] } };
  const ofOrders = { orderId: { in: [...scope.orderIds] } };
  const proofs = await tx.orderHandoverProof.findMany({
    where: ofOrders,
    select: { photoKey: true, signatureKey: true },
  });
  // Ce qui part en cascade depuis la journée, compté AVANT : le compte rendu
  // dit ce qui a disparu, pas seulement ce qu'on a nommé.
  const cascaded =
    (await tx.productionOrder.count({ where: ofDays })) +
    (await tx.productionOrderLine.count({ where: { order: ofDays } })) +
    (await tx.productionCount.count({ where: ofDays }));
  const counts = [
    await tx.productionReturnRequest.deleteMany({ where: ofDays }),
    await tx.productionHandoff.deleteMany({ where: ofDays }),
    await tx.productionBatch.deleteMany({ where: ofDays }),
    await tx.productionDay.deleteMany({ where: ofDays }),
    await tx.productionDayChange.deleteMany({ where: ofDays }),
    // Le retrait n'appartient à aucune journée : il se vise par la commande.
    await tx.orderHandoverProof.deleteMany({ where: ofOrders }),
    await tx.orderDeparture.deleteMany({ where: ofOrders }),
    await tx.orderHandover.deleteMany({ where: ofOrders }),
  ];
  return {
    rows: cascaded + counts.reduce((total, { count }) => total + count, 0),
    proofKeys: proofs.flatMap((proof) =>
      proof.signatureKey === null ? [proof.photoKey] : [proof.photoKey, proof.signatureKey],
    ),
  };
}

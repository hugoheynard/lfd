import type { PurgeClient, ScenarioScope } from "./scenario-scope.js";

/** L'origine d'un réassort né d'une sortie de la réserve du colisage (`SiteResupply`). */
const RESERVE_ORIGIN = "reserve";

/**
 * **Les sorties de réserve du scénario** (plan A1, lot A1.4) : les réassorts
 * que « Envoyer en boutique » a créés sur une journée du scénario, leurs
 * lignes et leur réception au point.
 *
 * Seulement eux : la réserve qu'ils vident est le stock du colisage de la
 * journée, que `purgePacking` emporte ; un réassort demandé par le comptoir
 * ou envoyé par le fournil n'est pas né du scénario et reste. Le colisage n'en
 * garde aucune copie (`PackingReserveShopRelease` ne touche que le stock et
 * publie un fait, relu le 2026-10-25).
 *
 * Enfants d'abord : toutes les clés sont `Restrict`.
 */
export async function purgeReserveResupplies(
  tx: PurgeClient,
  scope: ScenarioScope,
): Promise<number> {
  const resupplies = await tx.siteResupply.findMany({
    where: {
      origin: RESERVE_ORIGIN,
      serviceDay: { in: scope.days.map((day) => new Date(`${day}T00:00:00.000Z`)) },
    },
    select: { id: true },
  });
  const ids = resupplies.map((resupply) => resupply.id);
  const ofResupplies = { resupplyId: { in: ids } };
  const counts = [
    await tx.resupplyReceiptLine.deleteMany({ where: { receipt: ofResupplies } }),
    await tx.resupplyReceipt.deleteMany({ where: ofResupplies }),
    await tx.siteResupplyLine.deleteMany({ where: ofResupplies }),
    await tx.siteResupply.deleteMany({ where: { id: { in: ids } } }),
  ];
  return counts.reduce((total, { count }) => total + count, 0);
}

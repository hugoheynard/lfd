import type { PrismaClient } from "../../platform/database/client/client.js";

/**
 * **Ce que la nature maison tient d'une société, en `RESTRICT`** : ses
 * récapitulatifs des BL (BL couverts et lignes d'abord, puis le
 * récapitulatif, délié de son rectificatif pour que la clé interne ne
 * refuse pas), les issues du passage mensuel et l'historique du marquage.
 * À retirer avant la société, après les commandes.
 */
export async function dropInHouseRestrictedRows(
  prisma: PrismaClient,
  companyIds: readonly string[],
): Promise<void> {
  const ofPayers = { payerId: { in: [...companyIds] } };
  await prisma.inHouseRecapNote.deleteMany({ where: { recap: ofPayers } });
  await prisma.inHouseRecapLine.deleteMany({ where: { recap: ofPayers } });
  await prisma.inHouseRecap.updateMany({ where: ofPayers, data: { replacedById: null } });
  await prisma.inHouseRecap.deleteMany({ where: ofPayers });
  await prisma.inHouseRecapRun.deleteMany({ where: ofPayers });
  await prisma.payerInHouse.deleteMany({ where: { companyId: { in: [...companyIds] } } });
}

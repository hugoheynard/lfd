import { CancelBatchCommand } from "../../production/application/commands/cancel-batch.command.js";
import { RecordBatchCommand } from "../../production/application/commands/record-batch.command.js";
import { SEED_STAFF_SUB, type SeedContext } from "./order-placing.seed.js";

/** Les pièces de la fournée sortie par erreur, puis reprise. */
const MISTAKEN_PIECES = 2;

/**
 * **Une fournée sortie par erreur, et reprise au colisage** — la seule pièce de
 * la journée de démonstration que le colisage tranche (plan
 * `documentation/colisage/colisage.md`, K2, §13 B2).
 *
 * Sur une journée `packing`, annuler une fournée remise est une DEMANDE : elle
 * part au colisage, qui rend ce qui n'est pas au bac, et seule sa réponse
 * fait baisser « sorti ». Le semis le joue par les vrais handlers, en
 * attendant la boîte d'envoi à chaque étape — c'est la répétition que le §13
 * demande, sur le poste de dev.
 *
 * Deux pièces d'un article déjà au compte du jour, déclarées APRÈS le colisage
 * du comptoir : aucune n'est dans un bac, donc le colisage les rend toutes, et
 * la fournée finit annulée. Le compte d'avant est inchangé.
 *
 * @returns l'article repris, ou `null` si la journée n'a rien au compte.
 */
export async function seedReturnedBatch(
  context: SeedContext,
  serviceDay: string,
): Promise<string | null> {
  const item = await context.prisma.productionCount.findFirst({
    where: { serviceDay },
    select: { sku: true },
    orderBy: { sku: "asc" },
  });
  if (item === null) {
    return null;
  }
  // Un identifiant déterministe : le semis se rejoue sur une base vidée.
  const batchId = `seed-retour-${serviceDay}`;
  await context.commands.execute(
    new RecordBatchCommand(serviceDay, item.sku, batchId, MISTAKEN_PIECES, "", SEED_STAFF_SUB),
  );
  await context.settle();
  await context.commands.execute(new CancelBatchCommand(serviceDay, batchId, SEED_STAFF_SUB));
  // La demande, la décision du colisage, puis sa réponse au fournil.
  await context.settle();
  return item.sku;
}

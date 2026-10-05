/**
 * ⚠️ **Efface ce que le fournil a enregistré sur un poste.** Destructif, et
 * c'est tout ce qu'il fait : il ne sème rien.
 *
 * ## Pourquoi ça existe
 *
 * Le rechargement supprime les commandes du commerce ; il ne touchait pas les
 * tables de la production. Un plan du soir reste donc en base avec ses fiches
 * d'atelier, dont les références ne désignent plus aucune commande — des
 * orphelines qu'aucun écran ne montre et que personne ne pense à nettoyer.
 *
 * Pire pour une démonstration : **un plan est un instantané qui ne se recalcule
 * pas.** Le compte à produire du 8 septembre continue d'annoncer 4 fiches et
 * leurs quantités, dont deux pour des commandes effacées. Le PDF qu'on tire
 * ensuite est juste au regard de la table, et faux au regard du monde — et on
 * cherche le défaut dans le rendu.
 *
 * C'est le même défaut que les buckets avaient avant le 2026-09-06, et la même
 * réponse : ce qu'un rechargement rend orphelin, il doit l'emporter.
 *
 * ## Pourquoi TOUT, et pas les seules journées touchées
 *
 * Un plan est un instantané **par journée**, tous clients confondus. En vider la
 * moitié laisserait un compte à produire qui annonce plus que ses fiches — un
 * chiffre faux, ce qui est pire qu'une table vide. Sur un poste il n'y a qu'un
 * client de référence, donc « tout » et « ce qui est touché » se rejoignent.
 *
 * ## La serrure
 *
 * Il n'en porte pas lui-même, et c'est délibéré : ses deux appelants — le
 * service du back-office et le script de commandes — refusent déjà toute cible
 * qui n'est pas un Postgres local, **avant** de l'atteindre. En ajouter une
 * troisième ici donnerait l'illusion que ce module est sûr appelé de n'importe
 * où, alors que ce qui le protège est la cible, pas lui.
 */

/**
 * **Les seules tables que cette coupe touche**, déclarées plutôt que devinées.
 *
 * Prendre le `PrismaClient` entier lui donnerait le droit d'effacer n'importe
 * quoi, et obligerait ses tests à en fabriquer un — donc à le caster, ce que la
 * porte `no-type-escapes` refuse à raison : un doublé qui caste dérive de la
 * signature qu'il prétend jouer sans que rien ne rougisse.
 *
 * Un consommateur ne dépend que des méthodes qu'il appelle réellement. Le vrai
 * client satisfait cette forme sans rien déclarer.
 */
export interface ProductionTables {
  readonly productionReturnRequest: Deletable;
  readonly productionHandoff: Deletable;
  readonly productionBatch: Deletable;
  readonly productionDay: DayTable;
  readonly orderHandover: Deletable;
  readonly packingLine: Deletable;
  readonly packingContainerLine: Deletable;
  readonly packingContainer: Deletable;
  readonly packingOrder: Deletable;
  readonly packingStock: Deletable;
  readonly packingReceipt: Deletable;
  readonly packingReturn: Deletable;
  readonly outboxMessage: OutboxPurge<SeededFactsFilter>;
  readonly outboxDelivery: OutboxPurge<{ readonly message: SeededFactsFilter }>;
}

/** Une table dont on n'emporte qu'une partie, désignée par un filtre. */
interface OutboxPurge<Where> {
  deleteMany(args: { readonly where: Where }): Promise<{ readonly count: number }>;
}

/** Le filtre des faits semés : par type, puis par journée de la charge. */
interface SeededFactsFilter {
  // Tableaux mutables : c'est la forme que le client Prisma accepte.
  readonly type: { readonly in: string[] };
  readonly OR: { readonly payload: { readonly path: string[]; readonly equals: string } }[];
}

/**
 * Les faits du fournil et du colisage qui portent `serviceDay` dans leur
 * charge, et dont la clé est DÉTERMINISTE pour une journée semée (vérifié le
 * 2026-10-05 dans `production/channels/` : `…handed_to_packing:mark-<jour>-…`,
 * `…day_closed:<jour>:<instant>`, `…packing_list_drawn:<jour>:<commande>`).
 * Valeurs littérales : `dev/` ne lit pas l'intérieur de ces blocs pour si peu.
 */
export const SEEDED_DAY_FACT_TYPES: readonly string[] = [
  "production.day_closed",
  "production.handed_to_packing",
  "production.packing_list_drawn",
  "production.return_requested",
  "packing.returned",
];

/** Une table qu'on vide d'un coup. */
interface Deletable {
  deleteMany(): Promise<{ readonly count: number }>;
}

/** Une table où l'on relit les journées avant de les effacer. */
interface DayTable extends Deletable {
  findMany(args: {
    readonly select: { readonly serviceDay: true };
  }): Promise<readonly { readonly serviceDay: string }[]>;
}

/** Ce que la coupe a emporté — de quoi le dire à qui l'a demandée. */
export interface ProductionResetReport {
  /** Les journées arrêtées. Leurs fiches et leur compte suivent en cascade. */
  readonly days: number;
  /** Les attestations de remise, qui ne dépendent d'aucune journée. */
  readonly handovers: number;
  /** Les faits d'outbox des journées effacées (cf. `purgeSeededDayFacts`). */
  readonly facts: number;
}

export async function resetProduction(prisma: ProductionTables): Promise<ProductionResetReport> {
  // `ProductionOrder`, ses lignes et `ProductionCount` partent en cascade depuis
  // la journée (`onDelete: Cascade`). Les supprimer un par un ici dupliquerait
  // le schéma, et une table ajoutée demain serait oubliée.
  // Sauf les fournées : leur clé vers la journée est `Restrict` — en service,
  // une journée qui a sorti du four ne se supprime pas. La coupe de démo les
  // emporte donc d'abord, sans quoi elle échouerait dès la première fournée
  // saisie (lecteur-de-migrations, 2026-09-28).
  // Les remises au colisage et les demandes de retour (colisage, K1–K2)
  // tiennent la journée en `Restrict`, comme les fournées : elles partent avant.
  const seededDays = await prisma.productionDay.findMany({ select: { serviceDay: true } });
  const facts = await purgeSeededDayFacts(
    prisma,
    seededDays.map((day) => day.serviceDay),
  );
  await prisma.productionReturnRequest.deleteMany();
  await prisma.productionHandoff.deleteMany();
  await prisma.productionBatch.deleteMany();
  const days = await prisma.productionDay.deleteMany();
  // Le colisage tient ses copies des mêmes journées, sans clé vers le fournil :
  // la frontière, voulue. Les lignes avant leur bac (`Restrict`).
  await prisma.packingLine.deleteMany();
  // Les contenants (K2b) tiennent leur commande en `Restrict`, et leurs lignes
  // tiennent le contenant : ils partent avant elle. Oubliés jusqu'au
  // 2026-10-05, ils faisaient échouer tout `seed:orders` dès qu'un sac avait
  // été ouvert au colisage.
  await prisma.packingContainerLine.deleteMany();
  await prisma.packingContainer.deleteMany();
  await prisma.packingOrder.deleteMany();
  await prisma.packingStock.deleteMany();
  await prisma.packingReceipt.deleteMany();
  await prisma.packingReturn.deleteMany();
  // La remise, elle, n'appartient à aucune journée — c'est tout l'objet de sa
  // table : une commande passée après la clôture reste remettable sans être au
  // plan. Elle se supprime donc à part.
  const handovers = await prisma.orderHandover.deleteMany();
  return { days: days.count, handovers: handovers.count, facts };
}

/**
 * 🔴 **Rend le semis rejouable dans la même journée** (2026-10-05).
 *
 * Effacer les journées sans leurs faits laissait dans `platform.outbox` les
 * faits du premier passage. Leur clé est déterministe et UNIQUE : au second
 * passage, la remise au colisage (`production.handed_to_packing:mark-<jour>-…`)
 * était absorbée par `ON CONFLICT DO NOTHING`, le colisage ne la recevait
 * jamais, et le semis échouait sur « Il manque 35 Croissant sortis du four ».
 *
 * Seulement les faits de CES journées et de CES types : le reste du journal
 * n'est pas à nous. Les livraisons d'abord (leur clé tient le message).
 */
async function purgeSeededDayFacts(
  prisma: ProductionTables,
  serviceDays: readonly string[],
): Promise<number> {
  if (serviceDays.length === 0) return 0;
  const where: SeededFactsFilter = {
    type: { in: [...SEEDED_DAY_FACT_TYPES] },
    OR: serviceDays.map((day) => ({ payload: { path: ["serviceDay"], equals: day } })),
  };
  await prisma.outboxDelivery.deleteMany({ where: { message: where } });
  const removed = await prisma.outboxMessage.deleteMany({ where });
  return removed.count;
}

import type { PrismaClient } from "../../platform/database/client/client.js";
import { CLIENT_RAISON_SOCIALE } from "./client.seed.js";
import { SEEDED_POINT_LABELS, SEEDED_ZONE_LABELS } from "./station.seed.js";

/**
 * ⚠️ **Remet la base sur ce que le seed déclare.** Destructif, et c'est tout ce
 * qu'il fait : il ne sème rien.
 *
 * Deux coupes, et deux seulement :
 *
 * 1. **les clients** — toute société et toute personne autres que le client de
 *    référence, avec ce qui leur appartient ;
 * 2. **la station** — tout point de retrait et toute zone que `station.seed.ts`
 *    ne déclare pas.
 *
 * ## Pourquoi la station aussi
 *
 * Parce qu'un poste accumule des points de retrait d'essai, et qu'ils ne sont
 * pas inertes : un point sans horaires déclarés ouvre le choix de créneau sur un
 * écran vide, et deux points marqués « par défaut » font présélectionner
 * n'importe lequel des deux. La station est un décor de vente ; un décor faux se
 * lit comme un produit cassé.
 *
 * 3. **les décisions tarifaires** — toute règle de prix et tout barème de
 *    volume. Aucune n'est semée : elles s'accumulent à la main, écran après
 *    écran, et elles ne sont pas inertes non plus.
 *
 * ## Pourquoi les décisions tarifaires, alors qu'il les épargnait
 *
 * _(2026-09-08 — ce paragraphe disait l'inverse.)_ Un poste finissait avec une
 * promotion produit à −12 %, une promotion de rayon à −8 %, un geste global à
 * −2 % et un **barème de volume à −10 % dès la première pièce**, tous posés en
 * essayant des écrans. Composés, ils faisaient payer un croissant 1,66 € au
 * lieu de 2,13 € — et plus personne ne pouvait lire ce qu'une mercuriale
 * ajoutait, puisque le tarif de départ n'était déjà plus celui du catalogue.
 *
 * Une décision tarifaire d'essai n'est pas un décor : c'est un prix. Un poste
 * qui en garde de vieilles ment sur ce que la caisse ferait.
 *
 * ⚠️ **Les LIMITES sont épargnées** (`price_floors`), et c'est délibéré : ce
 * sont des garde-fous, pas des remises. Les retirer supprimerait la protection
 * que l'écran affiche, et le poste cesserait de refuser ce que la production
 * refuse.
 *
 * ## Ce qu'il NE touche pas
 *
 * Le catalogue, le référentiel PIM, les heures limites, l'annuaire du staff, et
 * les **limites de marge**. Ni aucun point ni aucune zone que le seed déclare :
 * le semis les repose à l'identique.
 *
 * ## Ce qui se regénère
 *
 * `pnpm seed:growth` repose le corpus synthétique — les écrans de démarchage, de
 * cohortes et de pertes en ont besoin. Rien de ce que ce module supprime n'est
 * irremplaçable ; c'est la condition pour qu'il ait le droit d'exister.
 */

/** Ce que la coupe a emporté — de quoi le dire à qui l'a demandée. */
export interface ResetReport {
  readonly companies: number;
  readonly people: number;
  readonly pickupPoints: number;
  readonly zones: number;
  /** Règles de prix retirées — promotions, gestes, mercuriales d'essai. */
  readonly priceRules: number;
  /** Barèmes de volume retirés. */
  readonly volumeLadders: number;
}

export async function resetToSeed(prisma: PrismaClient): Promise<ResetReport> {
  // Visée par sa RAISON SOCIALE : la référence (`C-XXXXXX`) est générée par le
  // domaine à la création, donc inconnue d'un module qui n'a pas semé.
  const kept = await prisma.company.findFirst({
    where: { raisonSociale: CLIENT_RAISON_SOCIALE },
    select: { id: true },
  });
  if (kept === null) {
    throw new Error(
      `Société « ${CLIENT_RAISON_SOCIALE} » absente : rien ne serait épargné. Semer d'abord.`,
    );
  }

  const companyIds = (
    await prisma.company.findMany({ where: { id: { not: kept.id } }, select: { id: true } })
  ).map((company) => company.id);
  // **Toute personne qui n'est pas membre du client gardé.**
  //
  // 🔴 Ce filtre ne visait d'abord que les membres d'une société supprimée. Il
  // laissait derrière lui 44 personnes SANS société et leurs 94 commandes
  // personnelles — le parcours « zéro friction », où la commande n'appartient
  // qu'au client connecté. Ce sont des clients comme les autres ; les épargner
  // rendait le compte de sociétés juste et la base toujours fausse.
  //
  // Le staff vit dans une autre table (`StaffUser`) et n'est jamais visé.
  const userIds = (
    await prisma.user.findMany({
      where: { memberships: { none: { companyId: kept.id } } },
      select: { id: true },
    })
  ).map((user) => user.id);

  await wipe(prisma, companyIds, userIds);
  const station = await trimStation(prisma);
  const pricing = await trimPricing(prisma);
  return { companies: companyIds.length, people: userIds.length, ...station, ...pricing };
}

/**
 * Retire **toutes** les décisions tarifaires : règles et barèmes.
 *
 * Toutes, y compris les mercuriales : un rechargement qui en laisserait une
 * rendrait le cas « client sans tarif négocié » inéprouvable, alors que c'est
 * le cas de départ de tout nouveau compte.
 *
 * Le **journal** part avec elles. Il est append-only par nature et on ne
 * l'efface nulle part ailleurs — mais il n'y a pas de fait à préserver ici :
 * ses lignes décrivent des règles qui n'existent plus, sur une base de
 * démonstration. Les garder ferait un journal qui raconte une histoire dont
 * aucun sujet n'est là.
 *
 * ⚠️ Aucune commande n'en dépend : le prix qu'une ligne a payé est **figé sur
 * elle**, avec sa trace. Retirer la règle ne rend donc aucune facture muette —
 * c'est toute la raison d'être de ce figeage.
 */
async function trimPricing(
  prisma: PrismaClient,
): Promise<{ priceRules: number; volumeLadders: number }> {
  await prisma.pricingEvent.deleteMany();
  const rules = await prisma.priceRule.deleteMany();
  const ladders = await prisma.volumeLadder.deleteMany();
  // Les engagements de volume pointent une société : ils sont déjà partis avec
  // elles, sauf ceux du client gardé. Ils se rattachent aux barèmes qu'on vient
  // de retirer, donc ils n'ouvrent plus rien.
  await prisma.volumeCommitment.deleteMany();
  return { priceRules: rules.count, volumeLadders: ladders.count };
}

/**
 * Supprime, **enfants d'abord**.
 *
 * Les FK `Restrict` — Address, Order, Subscription — exigent la suppression
 * explicite ; Membership et OrderLine cascadent. L'ordre n'est pas une
 * précaution : c'est la seule séquence que Postgres accepte.
 */
async function wipe(prisma: PrismaClient, companyIds: string[], userIds: string[]): Promise<void> {
  const subjects = [...companyIds, ...userIds];
  await prisma.activityEvent.deleteMany({ where: { subjectId: { in: subjects } } });
  await prisma.leadScore.deleteMany({ where: { subjectId: { in: subjects } } });
  await prisma.accountAlert.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.accountAlertOverride.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.companyTermination.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.supportRequest.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.orderCutoffWaiver.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.orderDraft.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.paymentMandate.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.order.deleteMany({
    where: { OR: [{ companyId: { in: companyIds } }, { placedByUserId: { in: userIds } }] },
  });
  await prisma.subscription.deleteMany({ where: { placedByUserId: { in: userIds } } });
  // Les préférences d'acheminement POINTENT sur les adresses : les délier avant
  // de supprimer, sinon la FK refuse et le message ne dit pas pourquoi.
  await prisma.company.updateMany({
    where: { id: { in: companyIds } },
    data: { preferredDeliveryAddressId: null, preferredPickupAddressId: null },
  });
  await prisma.address.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.membership.deleteMany({
    where: { OR: [{ companyId: { in: companyIds } }, { userId: { in: userIds } }] },
  });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

/**
 * Retire les points de retrait et les zones que le seed ne déclare pas.
 *
 * Rien ne pointe vers ces lignes depuis une commande : une commande **fige un
 * instantané** des champs postaux du point (`orders.pickup_address`, en JSON),
 * précisément pour rester lisible quand le point change ou disparaît. Les
 * retirer ne rend donc aucune commande muette.
 *
 * La seule référence vivante est l'habitude d'acheminement d'une société, déliée
 * ici explicitement — la base la mettrait à `null` toute seule, mais un `SET NULL`
 * silencieux se découvre mal.
 */
async function trimStation(prisma: PrismaClient): Promise<{ pickupPoints: number; zones: number }> {
  await prisma.company.updateMany({
    where: { preferredPickupAddress: { label: { notIn: [...SEEDED_POINT_LABELS] } } },
    data: { preferredPickupAddressId: null },
  });
  const points = await prisma.pickupAddress.deleteMany({
    where: { label: { notIn: [...SEEDED_POINT_LABELS] } },
  });
  const zones = await prisma.deliveryZone.deleteMany({
    where: { label: { notIn: [...SEEDED_ZONE_LABELS] } },
  });
  return { pickupPoints: points.count, zones: zones.count };
}

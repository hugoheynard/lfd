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
 * ## Ce qu'il NE touche pas
 *
 * Le catalogue, le référentiel PIM, les heures limites, l'annuaire du staff, les
 * règles de prix. Et il ne touche aucun point ni aucune zone que le seed
 * déclare : le semis les repose à l'identique.
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
  return { companies: companyIds.length, people: userIds.length, ...station };
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

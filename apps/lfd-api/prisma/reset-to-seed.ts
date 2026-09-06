import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/platform/database/client/client.js";
import { refuseNonLocalTarget } from "./local-target.js";
import { CLIENT_REFERENCE } from "./seed-client.js";
import { SEEDED_POINT_LABELS, SEEDED_ZONE_LABELS } from "./seed-station.js";

/**
 * ⚠️ **Remet la base sur ce que le seed déclare.** Destructif, et c'est tout ce
 * qu'il fait : il ne sème rien.
 *
 * Deux coupes, et deux seulement :
 *
 * 1. **les clients** — toute société et toute personne autres que le client de
 *    référence, avec ce qui leur appartient ;
 * 2. **la station** — tout point de retrait et toute zone que `seed-station.ts`
 *    ne déclare pas.
 *
 * ## Pourquoi il existe
 *
 * La base de développement avait accumulé 250 sociétés — le corpus synthétique
 * du seed growth, des sociétés de test à moitié remplies, et le compte du
 * développeur. Devant un écran, plus personne ne pouvait dire si ce qu'il voyait
 * était le comportement du produit ou un artefact du corpus.
 *
 * ## Pourquoi il n'est pas dans `db:seed`
 *
 * Parce qu'un script qui sème et un script qui supprime ne doivent pas partager
 * une commande. `pnpm db:seed` est **additif** et le restera : on peut le lancer
 * sans réfléchir. Celui-ci porte son intention dans son nom, refuse toute cible
 * qui n'est pas un Postgres local, et **annonce ce qu'il va détruire** avant de
 * le faire.
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
 * déclare : `pnpm db:seed` les repose à l'identique.
 *
 * ## Ce qui se regénère
 *
 * `pnpm seed:growth` repose le corpus synthétique — les écrans de démarchage,
 * de cohortes et de pertes en ont besoin. Rien de ce que ce script supprime
 * n'est irremplaçable ; c'est la condition pour qu'il ait le droit d'exister.
 */
async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_LFD_URL"] ?? "";
  refuseNonLocalTarget(
    connectionString,
    "ce script SUPPRIME des sociétés, des personnes et leurs commandes.",
  );

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const kept = await prisma.company.findUnique({
      where: { reference: CLIENT_REFERENCE },
      select: { id: true, raisonSociale: true, enseigne: true },
    });
    if (kept === null) {
      throw new Error(
        `Société de référence « ${CLIENT_REFERENCE} » absente : rien ne serait épargné. ` +
          "Lancer d'abord : pnpm --filter lfd-api db:seed",
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

    console.log(
      `▸ À supprimer : ${companyIds.length} société(s), ${userIds.length} personne(s), ` +
        "et tout ce qui leur appartient (commandes, adresses, abonnements, journal).",
    );
    console.log(`▸ Conservé : ${kept.enseigne || kept.raisonSociale} (${CLIENT_REFERENCE}).`);

    await wipe(prisma, companyIds, userIds);
    await trimStation(prisma);
    console.log("✔ Base remise sur ce que le seed déclare.");
  } finally {
    await prisma.$disconnect();
  }
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
async function trimStation(prisma: PrismaClient): Promise<void> {
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
  if (points.count > 0 || zones.count > 0) {
    console.log(
      `✓ Station élaguée : ${points.count} point(s) de retrait et ${zones.count} zone(s) hors seed retirés.`,
    );
  }
}

main().catch((error: unknown) => {
  console.error("✗ reset échoué :", error);
  process.exitCode = 1;
});

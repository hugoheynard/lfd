import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/infra/database/client/client.js";
import { SEED_EMAIL_DOMAIN, SEED_SUB_PREFIX } from "./seed-growth/personas.js";

/**
 * Reset **scoppé au namespace du seed growth** — l'inverse destructif de
 * `seed:growth`. Ne touche QUE la donnée synthétique (`auth0Sub` préfixé `seed|`,
 * e-mails `seed-…@demo.lafoliedouce.fr` et tout ce qui en dépend). `dev@…` et la
 * donnée réelle ne sont jamais visés. À lancer avant un re-seed quand on veut
 * repartir d'un corpus propre (le seed étant additif, il ne réécrit pas l'existant).
 *
 * Ordre = enfants avant parents (les FK `Restrict` — Address, Order, Subscription —
 * exigent la suppression explicite ; Membership/Contact/OrderLine cascade).
 */
async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_B2B_URL"];
  if (connectionString === undefined || connectionString === "") {
    throw new Error("DATABASE_B2B_URL manquant.");
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const userIds = await ids(
      prisma.user.findMany({
        where: { auth0Sub: { startsWith: SEED_SUB_PREFIX } },
        select: { id: true },
      }),
    );
    const companyIds = dedupe(
      (
        await prisma.membership.findMany({
          where: { userId: { in: userIds } },
          select: { companyId: true },
        })
      ).map((m) => m.companyId),
    );
    const leadIds = await ids(
      prisma.lead.findMany({
        where: { email: { endsWith: `@${SEED_EMAIL_DOMAIN}` } },
        select: { id: true },
      }),
    );
    await wipe(prisma, userIds, companyIds, leadIds);
    console.log(
      `✔ reset growth : ${userIds.length} personnes, ${companyIds.length} sociétés, ${leadIds.length} leads (+ journal, commandes, adresses) purgés.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

/** Supprime, enfants d'abord, tout ce qui est rattaché au namespace du seed. */
async function wipe(
  prisma: PrismaClient,
  userIds: string[],
  companyIds: string[],
  leadIds: string[],
): Promise<void> {
  const subjects = [...userIds, ...companyIds, ...leadIds];
  await prisma.activityEvent.deleteMany({ where: { subjectId: { in: subjects } } });
  await prisma.leadScore.deleteMany({ where: { subjectId: { in: subjects } } });
  await prisma.companyTermination.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.order.deleteMany({
    where: { OR: [{ placedByUserId: { in: userIds } }, { companyId: { in: companyIds } }] },
  });
  await prisma.subscription.deleteMany({ where: { placedByUserId: { in: userIds } } });
  await prisma.address.deleteMany({ where: { companyId: { in: companyIds } } });
  // `Membership.company` n'est pas en cascade (seul le côté user l'est) → explicite.
  await prisma.membership.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { companyId: { in: companyIds } }] },
  });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function ids(rows: Promise<{ id: string }[]>): Promise<string[]> {
  return (await rows).map((r) => r.id);
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

main().catch((error: unknown) => {
  console.error("reset growth: échec", error);
  process.exitCode = 1;
});

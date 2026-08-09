import "dotenv/config";
import {
  PrismaClient,
  CompanyStatus,
  CustomerRole,
  FulfillmentMethod,
  OrderStatus,
  UserStatus,
} from "../src/infra/database/client/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

import { localToInstant } from "../src/growth/domain/paris-time.js";

/**
 * Seed **fiche client** — les deux cas qu'on regarde en boucle en développant la
 * page Calendrier et la fiche commerciale :
 *
 * - **TestFicheClientEtablit** — un compte installé : actif depuis plus d'un an,
 *   3 commandes, 2 paniers récurrents, et une tendance 30 jours qui MONTE (deux
 *   commandes récentes contre une plus ancienne). Rendez-vous **aujourd'hui à
 *   16 h** ;
 * - **TestClientInscription** — l'inverse : inscrit il y a quelques jours,
 *   bloqué tôt (aucune pièce, aucune commande, compte `pending`). Rendez-vous
 *   **aujourd'hui à 17 h**.
 *
 * **Rejouable** : le script efface d'abord *ses* données (identifiants fixes,
 * préfixés `seed-fiche`) avant de les recréer. C'est ce qui garantit qu'un
 * re-seed redonne un rendez-vous à 16 h **du jour**, et non un doublon refusé
 * par l'index unique du créneau.
 *
 * Il ne touche à **rien d'autre** : aucune table n'est vidée, aucune donnée
 * voisine n'est modifiée.
 *
 *     pnpm --filter lfc-b2b-platform-backend run db:seed:fiche
 */

/** Tout ce que ce seed possède porte ce préfixe — c'est son périmètre d'effacement. */
const NS = "seed-fiche";

const ESTABLISHED = {
  companyId: `${NS}-company-etabli`,
  userId: `${NS}-user-etabli`,
  auth0Sub: `auth0|${NS}-etabli`,
  appointmentId: `appt_${NS}_etabli`,
  reference: "C-SEEDF1",
  raisonSociale: "TestFicheClientEtablit",
  time: "16:00",
} as const;

const SIGNING_UP = {
  companyId: `${NS}-company-inscription`,
  userId: `${NS}-user-inscription`,
  auth0Sub: `auth0|${NS}-inscription`,
  appointmentId: `appt_${NS}_inscription`,
  reference: "C-SEEDF2",
  raisonSociale: "TestClientInscription",
  time: "17:00",
} as const;

const url = process.env["DATABASE_B2B_URL"];
if (!url) {
  throw new Error("DATABASE_B2B_URL manquante (.env) — impossible de seeder.");
}

/**
 * Même bascule que `PrismaService` : une URL Postgres directe passe par
 * l'adaptateur, une URL Accelerate par `accelerateUrl`. Sans ça, le seed ne
 * tourne qu'en prod ou qu'en local, jamais les deux.
 */
const prisma = new PrismaClient(
  url.startsWith("postgresql://") || url.startsWith("postgres://")
    ? { adapter: new PrismaPg({ connectionString: url }) }
    : { accelerateUrl: url },
);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Le jour d'aujourd'hui à Paris (`AAAA-MM-JJ`) — le fuseau de l'agenda fait foi. */
function parisToday(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

/** Un instant à `days` jours en arrière. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

/**
 * L'instant UTC d'une heure locale d'aujourd'hui. `localToInstant` rend `null`
 * sur une heure qui n'existe pas (nuit du passage à l'heure d'été) — 16 h et 17 h
 * ne sont pas concernées, mais on refuse de deviner plutôt que de semer une date
 * fausse.
 */
function todayAt(time: string): Date {
  const instant = localToInstant(parisToday(), time);
  if (instant === null) {
    throw new Error(`Heure locale impossible aujourd'hui : ${time}`);
  }
  return instant;
}

/** Efface ce que CE seed a créé, et rien d'autre. */
async function wipe(): Promise<void> {
  await prisma.appointment.deleteMany({
    where: { id: { in: [ESTABLISHED.appointmentId, SIGNING_UP.appointmentId] } },
  });
  const companyIds = [ESTABLISHED.companyId, SIGNING_UP.companyId];
  const userIds = [ESTABLISHED.userId, SIGNING_UP.userId];
  // Les lignes tombent en cascade avec leur commande / leur abonnement.
  await prisma.order.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.subscription.deleteMany({ where: { placedByUserId: { in: userIds } } });
  await prisma.membership.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

/** La personne et sa société, reliées par un membership de gestionnaire. */
async function seedCompany(
  persona: typeof ESTABLISHED | typeof SIGNING_UP,
  company: { status: CompanyStatus; createdAt: Date; activatedAt: Date | null; nafCode: string },
): Promise<void> {
  await prisma.user.create({
    data: {
      id: persona.userId,
      auth0Sub: persona.auth0Sub,
      email: `${persona.raisonSociale.toLowerCase()}@exemple.fr`,
      firstName: "Camille",
      lastName: "Roy",
      phone: "0600000000",
      status: UserStatus.active,
      createdAt: company.createdAt,
    },
  });
  await prisma.company.create({
    data: {
      id: persona.companyId,
      reference: persona.reference,
      raisonSociale: persona.raisonSociale,
      formeJuridique: "SAS",
      siret: "00000000000000",
      nafCode: company.nafCode,
      contactPrenom: "Camille",
      contactNom: "Roy",
      contactEmail: `${persona.raisonSociale.toLowerCase()}@exemple.fr`,
      contactTelephone: "0600000000",
      status: company.status,
      createdAt: company.createdAt,
      activatedAt: company.activatedAt,
    },
  });
  await prisma.membership.create({
    data: {
      userId: persona.userId,
      companyId: persona.companyId,
      role: CustomerRole.company_admin,
    },
  });
}

/** Une commande, avec deux lignes — de quoi qu'elle ne soit pas vide à l'écran. */
async function seedOrder(index: number, days: number, totalCents: number): Promise<void> {
  const placedAt = daysAgo(days);
  await prisma.order.create({
    data: {
      id: `${NS}-order-${index}`,
      orderNumber: `CMD-SEEDF-${index}`,
      companyId: ESTABLISHED.companyId,
      placedByUserId: ESTABLISHED.userId,
      status: OrderStatus.fulfilled,
      fulfillmentMethod: FulfillmentMethod.delivery,
      subtotalCents: totalCents,
      totalCents,
      createdAt: placedAt,
      lines: {
        create: [
          {
            sku: "CAFE-GRAIN-1KG",
            productNameSnapshot: "Café en grains — 1 kg",
            unitPriceCents: 2_400,
            quantity: 4,
            lineTotalCents: 9_600,
          },
          {
            sku: "THE-VERT-250G",
            productNameSnapshot: "Thé vert — 250 g",
            unitPriceCents: 1_200,
            quantity: 2,
            lineTotalCents: 2_400,
          },
        ],
      },
    },
  });
}

/** Un panier récurrent actif, avec sa ligne. */
async function seedSubscription(index: number, recurrence: string): Promise<void> {
  await prisma.subscription.create({
    data: {
      id: `${NS}-subscription-${index}`,
      placedByUserId: ESTABLISHED.userId,
      recurrence,
      status: "active",
      startDate: daysAgo(60),
      fulfillmentMethod: FulfillmentMethod.delivery,
      note: `Panier récurrent de démonstration (${recurrence})`,
      createdAt: daysAgo(60),
      lines: { create: [{ sku: "CAFE-GRAIN-1KG", quantity: 3 }] },
    },
  });
}

/** Le rendez-vous du jour, à l'heure voulue. */
async function seedAppointment(
  persona: typeof ESTABLISHED | typeof SIGNING_UP,
  purpose: string,
  message: string,
): Promise<void> {
  const startAt = todayAt(persona.time);
  await prisma.appointment.create({
    data: {
      id: persona.appointmentId,
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
      status: "confirmed",
      channel: "phone",
      purpose,
      subjectType: "company",
      subjectId: persona.companyId,
      contactName: "Camille Roy",
      contactEmail: `${persona.raisonSociale.toLowerCase()}@exemple.fr`,
      contactPhone: "0600000000",
      message,
    },
  });
}

async function main(): Promise<void> {
  await wipe();

  // 1) Le compte installé : ancien, actif, et qui commande.
  await seedCompany(ESTABLISHED, {
    status: CompanyStatus.active,
    createdAt: daysAgo(430),
    activatedAt: daysAgo(420),
    nafCode: "5610A",
  });
  // Deux commandes dans les 30 derniers jours contre une dans les 30 précédents :
  // la tendance de la fiche MONTE, ce qui est justement ce qu'on veut voir.
  await seedOrder(1, 5, 12_000);
  await seedOrder(2, 20, 18_000);
  await seedOrder(3, 45, 24_000);
  await seedSubscription(1, "weekly");
  await seedSubscription(2, "monthly");
  await seedAppointment(
    ESTABLISHED,
    "recurring",
    "Souhaite passer le panier hebdo à deux livraisons par semaine.",
  );

  // 2) L'inscription bloquée tôt : aucune pièce, aucune commande, `pending`.
  await seedCompany(SIGNING_UP, {
    status: CompanyStatus.pending,
    createdAt: daysAgo(3),
    activatedAt: null,
    nafCode: "",
  });
  await seedAppointment(
    SIGNING_UP,
    "discover",
    "Vient de créer son compte, veut comprendre l'offre avant d'aller plus loin.",
  );

  const day = parisToday();
  console.log("✓ Seed fiche client :");
  console.log(`  · ${ESTABLISHED.raisonSociale} — RDV ${day} à ${ESTABLISHED.time}`);
  console.log("    3 commandes · 2 paniers récurrents · tendance 30 j en hausse");
  console.log(`  · ${SIGNING_UP.raisonSociale} — RDV ${day} à ${SIGNING_UP.time}`);
  console.log("    compte en attente · aucune commande");
}

main()
  .catch((error: unknown) => {
    console.error("✗ Seed fiche échoué :", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

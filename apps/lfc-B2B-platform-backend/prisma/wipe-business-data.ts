import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/infra/database/client/client.js";

/**
 * **Remise à blanc du contenu métier** — comptes, sociétés, commandes.
 *
 * Écrit pour nettoyer la production avant l'ouverture commerciale : la base
 * porte des mois de données de test, et un vrai client ne doit pas naître à
 * côté de « hugo testCom ».
 *
 * ⚠️ **IRRÉVERSIBLE.** Il n'y a pas de corbeille, pas d'archivage : ces tables
 * sont vidées. Prends une sauvegarde avant si le moindre doute subsiste.
 *
 * **Il ne fait rien par défaut.** Sans `APPLY=1`, il compte et affiche ce qu'il
 * supprimerait, sans écrire une ligne. C'est le mode qu'on lance en premier, et
 * celui qu'on relance après pour vérifier qu'il ne reste rien.
 *
 * Ce qu'il **ne touche pas** : la configuration de la plateforme (zones,
 * créneaux, points de retrait, règles d'alerte, disponibilités), les deux
 * comptes staff conservés, et **Auth0** — décidé ainsi. Les identités qui y
 * restent ne correspondront plus à rien : une connexion réussie mènera à un
 * compte inconnu du backend, qu'il faudra rouvrir depuis le back-office.
 */

/** Les seuls comptes staff qui survivent. Comparaison insensible à la casse. */
const KEPT_STAFF_EMAILS = ["dev@lafoliedouce.com", "cecile@lafoliedouce.com"];

/** Une table à vider, réduite aux deux gestes de ce script. */
interface WipedTable {
  readonly name: string;
  readonly size: () => Promise<number>;
  readonly wipe: () => Promise<{ count: number }>;
}

/**
 * L'ordre de suppression : **enfants avant parents**.
 *
 * Les FK en `Restrict` (Address → Company, Order → User) refusent la
 * suppression du parent tant qu'un enfant existe ; celles en `Cascade`
 * (OrderLine, Membership, CompanyContact…) suivraient toutes seules, mais on
 * les nomme quand même — un ordre explicite se relit, un ordre implicite se
 * découvre en production.
 *
 * Chaque délégué est **nommé**, pas résolu dynamiquement : le compilateur
 * vérifie ainsi que la table existe et que le nom en face est le bon. Une
 * résolution par chaîne aurait été plus courte, et se serait trompée en
 * silence sur un renommage.
 */
function wipedTables(prisma: PrismaClient): readonly WipedTable[] {
  return [
    {
      name: "SubscriptionLine",
      size: () => prisma.subscriptionLine.count(),
      wipe: () => prisma.subscriptionLine.deleteMany(),
    },
    {
      name: "SubscriptionOccurrence",
      size: () => prisma.subscriptionOccurrence.count(),
      wipe: () => prisma.subscriptionOccurrence.deleteMany(),
    },
    {
      name: "Subscription",
      size: () => prisma.subscription.count(),
      wipe: () => prisma.subscription.deleteMany(),
    },
    {
      name: "OrderLine",
      size: () => prisma.orderLine.count(),
      wipe: () => prisma.orderLine.deleteMany(),
    },
    {
      name: "OrderDraft",
      size: () => prisma.orderDraft.count(),
      wipe: () => prisma.orderDraft.deleteMany(),
    },
    { name: "Order", size: () => prisma.order.count(), wipe: () => prisma.order.deleteMany() },
    {
      name: "AccountAlert",
      size: () => prisma.accountAlert.count(),
      wipe: () => prisma.accountAlert.deleteMany(),
    },
    {
      name: "AccountAlertOverride",
      size: () => prisma.accountAlertOverride.count(),
      wipe: () => prisma.accountAlertOverride.deleteMany(),
    },
    {
      name: "StaffNotification",
      size: () => prisma.staffNotification.count(),
      wipe: () => prisma.staffNotification.deleteMany(),
    },
    {
      name: "Appointment",
      size: () => prisma.appointment.count(),
      wipe: () => prisma.appointment.deleteMany(),
    },
    {
      name: "SupportRequest",
      size: () => prisma.supportRequest.count(),
      wipe: () => prisma.supportRequest.deleteMany(),
    },
    {
      name: "CompanyTermination",
      size: () => prisma.companyTermination.count(),
      wipe: () => prisma.companyTermination.deleteMany(),
    },
    {
      name: "ActivityEvent",
      size: () => prisma.activityEvent.count(),
      wipe: () => prisma.activityEvent.deleteMany(),
    },
    {
      name: "LeadScore",
      size: () => prisma.leadScore.count(),
      wipe: () => prisma.leadScore.deleteMany(),
    },
    { name: "Lead", size: () => prisma.lead.count(), wipe: () => prisma.lead.deleteMany() },
    {
      name: "ProductNorm",
      size: () => prisma.productNorm.count(),
      wipe: () => prisma.productNorm.deleteMany(),
    },
    {
      name: "PaymentMandate",
      size: () => prisma.paymentMandate.count(),
      wipe: () => prisma.paymentMandate.deleteMany(),
    },
    {
      name: "CompanyContact",
      size: () => prisma.companyContact.count(),
      wipe: () => prisma.companyContact.deleteMany(),
    },
    {
      name: "Address",
      size: () => prisma.address.count(),
      wipe: () => prisma.address.deleteMany(),
    },
    {
      name: "Membership",
      size: () => prisma.membership.count(),
      wipe: () => prisma.membership.deleteMany(),
    },
    { name: "User", size: () => prisma.user.count(), wipe: () => prisma.user.deleteMany() },
    {
      name: "Company",
      size: () => prisma.company.count(),
      wipe: () => prisma.company.deleteMany(),
    },
  ];
}

/**
 * Ce qui reste, et **pourquoi** — la colonne de droite est le vrai contenu de
 * cette liste. Un modèle non classé fait échouer le script (cf. `assertClassified`).
 */
const KEPT_MODELS: Readonly<Record<string, string>> = {
  StaffUser: "les deux comptes conservés ; les autres sont traités à part",
  StaffPermissionOverride: "suit la suppression de son staff (cascade)",
  PickupAddress: "configuration — points de retrait de l'enseigne",
  DeliveryZone: "configuration — zones et frais de livraison",
  OrderCutoff: "configuration — heures limites de commande",
  BookingPolicySettings: "configuration — politique de rendez-vous",
  AlertRuleSetting: "configuration — seuils d'alerte globaux",
  AvailabilityRule: "configuration — disponibilités du staff conservé",
  AvailabilityException: "idem, exceptions de calendrier",
  MarketNafCode: "référentiel INSEE, aucune donnée client",
  MarketZone: "référentiel territorial, aucune donnée client",
};

async function main(): Promise<void> {
  const connectionString = required("DATABASE_B2B_URL");
  const apply = process.env["APPLY"] === "1";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  assertClassified(wipedTables(prisma).map((entry) => entry.name));
  try {
    await report(prisma, apply);
    if (!apply) {
      console.log("\nRien n'a été supprimé. Relance avec APPLY=1 pour exécuter.");
      return;
    }
    await wipe(prisma);
    console.log("\nTerminé. Relance SANS APPLY pour vérifier qu'il ne reste rien.");
  } finally {
    await prisma.$disconnect();
  }
}

/** Affiche ce qui existe, table par table, avant toute écriture. */
async function report(prisma: PrismaClient, apply: boolean): Promise<void> {
  console.log(apply ? "SUPPRESSION RÉELLE\n" : "SIMULATION — aucune écriture\n");
  for (const { name, size } of wipedTables(prisma)) {
    console.log(`  ${name.padEnd(24)} ${String(await size())}`);
  }
  const staff = await prisma.staffUser.findMany({ select: { email: true } });
  const doomed = staff.filter((row) => !isKept(row.email));
  console.log(`\n  StaffUser conservés       ${staff.length - doomed.length}`);
  console.log(`  StaffUser supprimés       ${doomed.length}`);
  for (const row of doomed) {
    console.log(`      · ${row.email}`);
  }
}

/**
 * Supprime, dans l'ordre déclaré, **hors transaction**.
 *
 * Une transaction unique serait plus élégante ; elle serait aussi une longue
 * écriture exclusive sur une base servie par une passerelle (Accelerate), avec
 * un plafond de durée. Une interruption laisse ici un état intermédiaire —
 * assumé : le script est rejouable, et la simulation dit ce qu'il reste.
 */
async function wipe(prisma: PrismaClient): Promise<void> {
  for (const { name, wipe: drop } of wipedTables(prisma)) {
    const removed = await drop();
    console.log(`  ${name.padEnd(24)} ${String(removed.count)} supprimé(s)`);
  }
  const removed = await prisma.staffUser.deleteMany({
    where: { NOT: { email: { in: KEPT_STAFF_EMAILS, mode: "insensitive" } } },
  });
  console.log(`  StaffUser${" ".repeat(16)} ${String(removed.count)} supprimé(s)`);
}

/**
 * **Le garde-fou.** Chaque modèle du schéma doit être soit vidé, soit conservé
 * avec sa raison. Ajouter une table sans y penser la laisserait silencieusement
 * pleine de données de test — ou, pire, la ferait vider sans qu'on l'ait voulu.
 */
function assertClassified(wipedNames: readonly string[]): void {
  const schema = readFileSync(fileURLToPath(new URL("schema.prisma", import.meta.url)), "utf8");
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1] ?? "");
  const classified = new Set<string>([...wipedNames, ...Object.keys(KEPT_MODELS)]);
  const forgotten = models.filter((model) => !classified.has(model));
  if (forgotten.length > 0) {
    throw new Error(
      `Modèles non classés : ${forgotten.join(", ")}. ` +
        "Ajoute-les à WIPED_MODELS ou à KEPT_MODELS avec leur raison.",
    );
  }
}

/** Une table à vider, réduite aux deux gestes de ce script. */
interface WipedTable {
  readonly name: string;
  readonly size: () => Promise<number>;
  readonly wipe: () => Promise<{ count: number }>;
}

function isKept(email: string): boolean {
  return KEPT_STAFF_EMAILS.includes(email.trim().toLowerCase());
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} manquant.`);
  }
  return value;
}

await main();

/**
 * Clone les données de la base **actuelle** (source) vers la base de **dev**
 * locale (cible) — `pnpm db:dev:clone`.
 *
 * `pg_dump` ne sait pas traverser Accelerate (`prisma+postgres://`) : on passe
 * donc par PrismaClient des deux côtés. On lit les **scalaires** de chaque table
 * (aucune relation) et on réécrit dans l'ordre des clés étrangères.
 *
 * - Source : `CLONE_SOURCE_URL`, sinon le `DATABASE_B2B_URL` courant (le `.env`,
 *   donc Accelerate). ⇒ lancer AVANT de basculer le `.env` sur la base locale.
 * - Cible : `CLONE_TARGET_URL`, sinon `DEV_DATABASE_URL`. **Refusée si ce n'est
 *   pas un Postgres direct local** (garde-fou : on n'écrase jamais une prod).
 *
 * Idempotent : purge la cible (ordre FK inverse) puis réinsère — un re-clone
 * repart d'un état propre.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/infra/database/client/client.js";
import { DEV_DATABASE_URL } from "./dev-db-url.js";

/** Le schéma de l'URL choisit le transport, comme `PrismaService`. */
function makeClient(url: string): PrismaClient {
  return isDirectPostgresUrl(url)
    ? new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
    : new PrismaClient({ accelerateUrl: url });
}

function isDirectPostgresUrl(url: string): boolean {
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

async function main(): Promise<void> {
  const sourceUrl = process.env["CLONE_SOURCE_URL"] ?? process.env["DATABASE_B2B_URL"] ?? "";
  const targetUrl = process.env["CLONE_TARGET_URL"] ?? DEV_DATABASE_URL;

  if (sourceUrl === "") {
    throw new Error("Source manquante : CLONE_SOURCE_URL, ou DATABASE_B2B_URL dans le .env.");
  }
  if (sourceUrl === targetUrl) {
    throw new Error("Source et cible identiques — refus (protection contre l'auto-écrasement).");
  }
  if (!isDirectPostgresUrl(targetUrl)) {
    throw new Error(
      `Cible refusée (${targetUrl}) : le clone n'écrit QUE vers un Postgres direct local (postgresql://).`,
    );
  }

  const source = makeClient(sourceUrl);
  const target = makeClient(targetUrl);
  try {
    // Lecture des scalaires (pas de relations) — l'ordre de lecture est libre.
    const [companies, users, memberships, contacts, addresses, supportRequests, orders, orderLines] =
      await Promise.all([
        source.company.findMany(),
        source.user.findMany(),
        source.membership.findMany(),
        source.companyContact.findMany(),
        source.address.findMany(),
        source.supportRequest.findMany(),
        source.order.findMany(),
        source.orderLine.findMany(),
      ]);

    // Purge de la cible en ordre FK INVERSE (enfants d'abord).
    await target.orderLine.deleteMany();
    await target.order.deleteMany();
    await target.supportRequest.deleteMany();
    await target.address.deleteMany();
    await target.companyContact.deleteMany();
    await target.membership.deleteMany();
    await target.user.deleteMany();
    await target.company.deleteMany();

    // Réinsertion en ordre FK (parents d'abord).
    await target.company.createMany({ data: companies });
    await target.user.createMany({ data: users });
    await target.membership.createMany({ data: memberships });
    await target.companyContact.createMany({ data: contacts });
    await target.address.createMany({ data: addresses });
    await target.supportRequest.createMany({ data: supportRequests });
    await target.order.createMany({ data: orders });
    await target.orderLine.createMany({ data: orderLines });

    process.stdout.write(
      `✔ clone terminé → ${targetUrl}\n` +
        `  companies=${companies.length} users=${users.length} memberships=${memberships.length}\n` +
        `  contacts=${contacts.length} addresses=${addresses.length} support=${supportRequests.length}\n` +
        `  orders=${orders.length} orderLines=${orderLines.length}\n`,
    );
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("✗ clone échoué :", error);
  process.exitCode = 1;
});

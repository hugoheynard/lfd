import "dotenv/config";
import {
  PrismaClient,
  CompanyStatus,
  CustomerRole,
  UserStatus,
} from "../src/infra/database/client/client.js";

/**
 * Seed de développement — **provisionne un customer de test**, exactement comme
 * le ferait un commercial (porte B du pipeline d'onboarding, cf.
 * `documentation/architecture-onboarding-provisioning-b2b.md`). Crée une
 * `Company` + un `User` `active` lié à un `sub` Auth0, pour que `GET /me`
 * réponde une identité réelle en dev.
 *
 * Idempotent : si le `User` (par `auth0Sub`) existe déjà, on ne recrée rien.
 * Surchargeable par variables d'env (SEED_*), défauts = compte de test du dev.
 */
const AUTH0_SUB = process.env["SEED_AUTH0_SUB"] ?? "auth0|6a6a2fb1a5c185cc18313e33";
const EMAIL = process.env["SEED_EMAIL"] ?? "hheynard@gmail.com";
const COMPANY_NAME = process.env["SEED_COMPANY"] ?? "LFC-TestComp-1";

const url = process.env["DATABASE_B2B_URL"];
if (!url) {
  throw new Error("DATABASE_B2B_URL manquante (.env) — impossible de seeder.");
}

const prisma = new PrismaClient({ accelerateUrl: url });

async function main(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { auth0Sub: AUTH0_SUB } });
  if (existing) {
    console.log(`✓ User déjà présent (${AUTH0_SUB}) — rien à faire.`);
    console.log(existing);
    return;
  }

  const company = await prisma.company.create({
    data: {
      raisonSociale: COMPANY_NAME,
      formeJuridique: "SAS",
      siret: "00000000000000",
      contactPrenom: "Hugo",
      contactNom: "Heynard",
      contactEmail: EMAIL,
      status: CompanyStatus.active,
    },
  });

  const user = await prisma.user.create({
    data: {
      auth0Sub: AUTH0_SUB,
      email: EMAIL,
      // Gestionnaire de sa société (owner du compte de test).
      role: CustomerRole.company_admin,
      status: UserStatus.active,
      companyId: company.id,
    },
  });

  console.log("✓ Seed créé :");
  console.log({ company: { id: company.id, raisonSociale: company.raisonSociale }, user });
}

main()
  .catch((error: unknown) => {
    console.error("✗ Seed échoué :", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

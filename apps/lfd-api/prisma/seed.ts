import "dotenv/config";
import {
  PrismaClient,
  CompanyStatus,
  CustomerRole,
  UserStatus,
} from "../src/platform/database/client/client.js";

/**
 * Seed de développement — **provisionne un customer de test**, exactement comme
 * le ferait un commercial (porte B du pipeline d'onboarding, cf.
 * `documentation/architecture-onboarding-provisioning-b2b.md`). Crée la
 * **personne** (son profil), sa **société**, et le **membership** qui les relie,
 * pour que `GET /me` réponde une identité réelle en dev.
 *
 * Idempotent : si le `User` (par `auth0Sub`) existe déjà, on ne recrée rien.
 * Surchargeable par variables d'env (SEED_*), défauts = compte de test du dev.
 *
 * `SEED_SKIP_COMPANY=1` sème la personne **sans aucune société** : c'est l'état
 * qui déclenche l'empty state « Mes entreprises » côté front, autrement pénible
 * à obtenir à la main.
 */
const AUTH0_SUB = process.env["SEED_AUTH0_SUB"] ?? "auth0|6a6a2fb1a5c185cc18313e33";
const EMAIL = process.env["SEED_EMAIL"] ?? "hheynard@gmail.com";
const COMPANY_NAME = process.env["SEED_COMPANY"] ?? "LFC-TestComp-1";
const SKIP_COMPANY = process.env["SEED_SKIP_COMPANY"] === "1";

const url = process.env["DATABASE_B2B_URL"];
if (!url) {
  throw new Error("DATABASE_B2B_URL manquante (.env) — impossible de seeder.");
}

const prisma = new PrismaClient({ accelerateUrl: url });

async function main(): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { auth0Sub: AUTH0_SUB },
    include: { memberships: true },
  });
  if (existing) {
    console.log(`✓ User déjà présent (${AUTH0_SUB}) — rien à faire.`);
    console.log(existing);
    return;
  }

  const user = await prisma.user.create({
    data: {
      auth0Sub: AUTH0_SUB,
      email: EMAIL,
      firstName: "Hugo",
      lastName: "Heynard",
      phone: "",
      status: UserStatus.active,
    },
  });

  if (SKIP_COMPANY) {
    console.log("✓ Personne semée SANS société (empty state « Mes entreprises ») :");
    console.log(user);
    return;
  }

  const company = await prisma.company.create({
    data: {
      reference: "C-DEV001",
      raisonSociale: COMPANY_NAME,
      formeJuridique: "SAS",
      // SIRET inconnu = chaîne vide (l'ouverture sans papiers est le cas normal).
      siret: "",
      contactPrenom: "Hugo",
      contactNom: "Heynard",
      contactEmail: EMAIL,
      // Société de test déjà validée : le dev n'a pas à jouer l'activation
      // commerciale pour travailler.
      status: CompanyStatus.active,
    },
  });

  // Le créateur d'une société en est le gestionnaire.
  await prisma.membership.create({
    data: { userId: user.id, companyId: company.id, role: CustomerRole.company_admin },
  });

  console.log("✓ Seed créé :");
  console.log({ user, company: { id: company.id, raisonSociale: company.raisonSociale } });
}

main()
  .catch((error: unknown) => {
    console.error("✗ Seed échoué :", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

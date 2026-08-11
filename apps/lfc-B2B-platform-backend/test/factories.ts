/**
 * Fabriques de données pour les tests e2e.
 *
 * ⚠️ **Dette assumée, à résorber** : elles écrivent par Prisma parce que le
 * contexte commerce n'a pas encore d'agrégat de domaine (`domain/entities/`).
 * Dès que `Company` et `User` existeront comme entités, ces fabriques devront
 * passer par leurs factories — une donnée de test que le domaine ne saurait pas
 * produire est une donnée que la prod ne verra jamais, et le test ne prouve
 * alors rien (cf. `CLAUDE.md` §5).
 *
 * En attendant, elles restent **minimales et nommées** : chaque appel ne
 * mentionne que ce qui compte pour le test, le reste est un défaut plausible.
 */
import {
  CompanyStatus,
  CustomerRole,
  UserStatus,
  type Company,
  type Membership,
  type User,
} from "../src/infra/database/client/client.js";
import type { PrismaService } from "../src/infra/database/prisma.service.js";

/** Ce qu'un test peut vouloir imposer sur une société. */
export interface CompanySeed {
  readonly raisonSociale?: string;
  readonly siret?: string;
  readonly status?: CompanyStatus;
}

/** Ce qu'un test peut vouloir imposer sur une personne. */
export interface UserSeed {
  readonly auth0Sub: string;
  readonly email?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly phone?: string;
  readonly status?: UserStatus;
  /** L'adresse a-t-elle été prouvée chez le fournisseur d'identité ? */
  readonly emailVerified?: boolean;
}

/**
 * Crée une société cliente (le tenant). `status` par défaut `active` : la plupart
 * des tests veulent une société utilisable, et ceux qui exercent l'attente de
 * validation passent `pending` explicitement.
 */
let referenceSeq = 0;

export function createCompany(prisma: PrismaService, seed: CompanySeed = {}): Promise<Company> {
  referenceSeq += 1;
  return prisma.company.create({
    data: {
      // Référence unique par appel (la base est purgée entre les tests).
      reference: `C-T${referenceSeq.toString().padStart(5, "0")}`,
      raisonSociale: seed.raisonSociale ?? "Café de Test SAS",
      formeJuridique: "SAS",
      siret: seed.siret ?? "12345678900015",
      contactPrenom: "Camille",
      contactNom: "Durand",
      contactEmail: "camille@test.fr",
      status: seed.status ?? CompanyStatus.active,
    },
  });
}

/**
 * Crée une personne — **sans aucune société**. Le rattachement est un acte à
 * part (`attachTo`) : c'est ce que le modèle dit désormais, et un test qui ne
 * rattache rien exerce l'état « compte tout juste créé ».
 *
 * `status` par défaut `active` ; les tests qui exercent un refus (invited,
 * disabled) le disent explicitement, ce qui rend leur intention lisible.
 */
export function createUser(prisma: PrismaService, seed: UserSeed): Promise<User> {
  return prisma.user.create({
    data: {
      auth0Sub: seed.auth0Sub,
      email: seed.email ?? `${seed.auth0Sub}@test.fr`,
      firstName: seed.firstName ?? "Camille",
      lastName: seed.lastName ?? "Durand",
      phone: seed.phone ?? "",
      status: seed.status ?? UserStatus.active,
      emailVerified: seed.emailVerified ?? false,
    },
  });
}

/** Rattache une personne à une société, avec son rôle dans celle-ci. */
export function attachTo(
  prisma: PrismaService,
  userId: string,
  companyId: string,
  role: CustomerRole = CustomerRole.orders,
): Promise<Membership> {
  return prisma.membership.create({ data: { userId, companyId, role } });
}

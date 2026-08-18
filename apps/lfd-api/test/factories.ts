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
import { Siret } from "../src/account/domain/value-objects/siret.js";
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
      // SIRET distinct par appel : la base en garantit désormais l'unicité, et
      // deux sociétés témoins d'un même test sont deux vraies sociétés.
      siret: seed.siret ?? nextValidSiret(),
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

/**
 * Un SIRET **distinct et valide** pour chaque société témoin.
 *
 * Distinct parce que la base en exige l'unicité ; valide parce que le domaine
 * en vérifie la clé de contrôle dès qu'il relit la société — une donnée de test
 * que le domaine refuserait est une donnée que la production ne verra jamais,
 * et le test ne prouverait alors rien.
 *
 * La clé n'est pas recalculée ici : on la **demande au value object**, en
 * essayant les dix chiffres possibles. Dupliquer la règle de Luhn dans les
 * tests, ce serait la maintenir à deux endroits — et la voir diverger.
 */
function nextValidSiret(): string {
  const base = `1234${referenceSeq.toString().padStart(9, "0")}`;
  for (let key = 0; key <= 9; key += 1) {
    const candidate = `${base}${key.toString()}`;
    if (isAcceptedByDomain(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Aucune clé de contrôle valide pour ${base} — la règle a changé.`);
}

/** Le domaine accepte-t-il ce SIRET ? Seule autorité en la matière. */
function isAcceptedByDomain(candidate: string): boolean {
  try {
    Siret.createOptional(candidate);
    return true;
  } catch {
    return false;
  }
}

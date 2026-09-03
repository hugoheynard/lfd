import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CompanyAlreadyHasOwnerError } from "../domain/errors/account-errors.js";
import {
  CompanyMemberReader,
  CompanyMemberRepository,
  type CompanyMemberRecord,
  type KnownAccount,
  type MemberToCreate,
} from "../domain/ports/company-member.repository.js";
import type { CompanyRole } from "../domain/value-objects/company-role.js";

/** Ce qu'une lecture de rattachement rapporte — la personne, avec son rôle. */
const MEMBER_SELECT = {
  role: true,
  createdAt: true,
  user: {
    select: { id: true, email: true, firstName: true, lastName: true, phone: true, status: true },
  },
} as const;

/** Adaptateur Prisma de la **lecture** des accès. */
@Injectable()
export class PrismaCompanyMemberReader extends CompanyMemberReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listOf(companyId: string): Promise<readonly CompanyMemberRecord[]> {
    const rows = await this.prisma.membership.findMany({
      where: { companyId },
      select: MEMBER_SELECT,
      // Le gestionnaire d'abord — c'est celui qu'on cherche des yeux —, puis par
      // ancienneté : l'ordre d'arrivée est la seule chronologie qu'on ait.
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(toMemberRecord);
  }
}

/** Adaptateur Prisma de l'**écriture** des accès. */
@Injectable()
export class PrismaCompanyMemberRepository extends CompanyMemberRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findAccountByEmail(email: string): Promise<KnownAccount | null> {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, auth0Sub: true, firstName: true, status: true },
    });
    // L'adresse ne se compare jamais telle quelle : `Jean@X.fr` et `jean@x.fr`
    // sont la même boîte, et deux identités pour une boîte, c'est deux mots de
    // passe pour une seule personne.
    return user === null
      ? null
      : {
          userId: user.id,
          subject: user.auth0Sub,
          firstName: user.firstName,
          status: user.status,
        };
  }

  async createInvited(input: MemberToCreate): Promise<string> {
    const user = await this.prisma.user.create({
      data: {
        auth0Sub: input.subject,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        // `invited` : l'identité existe, le mot de passe pas encore. C'est ce qui
        // distingue « n'a pas encore posé son mot de passe » de « ne s'est pas
        // connecté depuis longtemps ».
        status: "invited",
        invitedBy: input.invitedBy,
      },
      select: { id: true },
    });
    return user.id;
  }

  async rebindSubject(userId: string, subject: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { auth0Sub: subject } });
  }

  async findOwner(companyId: string): Promise<KnownAccount | null> {
    const owner = await this.prisma.membership.findFirst({
      where: { companyId, role: "owner" },
      // Le plus ancien fait foi : c'est celui qui a ouvert l'espace.
      orderBy: { createdAt: "asc" },
      select: { user: { select: { id: true, auth0Sub: true, firstName: true, status: true } } },
    });
    return owner === null
      ? null
      : {
          userId: owner.user.id,
          subject: owner.user.auth0Sub,
          firstName: owner.user.firstName,
          status: owner.user.status,
        };
  }

  async alignRole(userId: string, companyId: string, role: CompanyRole): Promise<void> {
    // `updateMany` : sans rattachement, il n'y a rien à aligner, et c'est un cas
    // normal (un interlocuteur sans accès). Un `update` lèverait pour un
    // non-événement.
    await this.prisma.membership.updateMany({ where: { userId, companyId }, data: { role } });
  }

  async attach(userId: string, companyId: string, role: CompanyRole): Promise<void> {
    // `upsert` et non `create` : ré-ouvrir l'accès de quelqu'un est le geste
    // courant (son lien s'est perdu). Échouer sur un doublon en ferait une
    // impasse, et ignorer le rôle demandé afficherait un rôle à l'écran en en
    // appliquant un autre.
    try {
      await this.prisma.membership.upsert({
        where: { userId_companyId: { userId, companyId } },
        create: { userId, companyId, role },
        update: { role },
      });
    } catch (error) {
      throw translateRivalOwner(error, companyId);
    }
  }

  async findMember(userId: string, companyId: string): Promise<CompanyMemberRecord | null> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_companyId: { userId, companyId } },
      select: MEMBER_SELECT,
    });
    return membership === null ? null : toMemberRecord(membership);
  }
}

/** Ligne Prisma → enregistrement de domaine (aplatit la personne). */
function toMemberRecord(row: {
  role: CompanyRole;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    status: "invited" | "active" | "disabled";
  };
}): CompanyMemberRecord {
  return {
    userId: row.user.id,
    email: row.user.email,
    firstName: row.user.firstName,
    lastName: row.user.lastName,
    phone: row.user.phone,
    role: row.role,
    status: row.user.status,
    joinedAt: row.createdAt,
  };
}

/**
 * Traduit la violation de l'index `memberships_one_owner` en refus **métier**.
 *
 * Le refus normal vient d'`ensureNoRivalOwner`, en amont, sur une lecture. Ce
 * chemin-ci n'existe que pour la **course** que cette lecture ne peut pas
 * fermer : deux commerciaux ouvrant l'accès détenteur à la même société dans la
 * même seconde lisent tous les deux « personne ».
 *
 * Ce qu'on gagne n'est PAS le statut — un `P2002` non traduit sort déjà en 409
 * par `mapPersistenceError`. C'est le **message** : « ressource dupliquée » ne
 * dit ni ce qui s'est passé, ni quoi faire, à quelqu'un qui n'a pas le code sous
 * les yeux. Celui de `CompanyAlreadyHasOwnerError` nomme le cas réel et le geste
 * de sortie, et les deux chemins deviennent indiscernables devant l'écran.
 *
 * Toute autre erreur repart telle quelle — on ne déguise pas une panne en
 * conflit. Un `P2002` sur `(user_id, company_id)`, notamment, n'est pas celui-ci
 * et ne doit pas emprunter ce message.
 */
function translateRivalOwner(error: unknown, companyId: string): unknown {
  if (readField(error, "code") !== "P2002") {
    return error;
  }
  const target = readField(readField(error, "meta"), "target");
  return mentionsOwnerIndex(target) ? new CompanyAlreadyHasOwnerError(companyId) : error;
}

/**
 * L'index violé est-il celui du détenteur ? Prisma nomme sa cible tantôt par une
 * chaîne (index posé en SQL brut, notre cas), tantôt par une liste de champs.
 */
function mentionsOwnerIndex(target: unknown): boolean {
  if (typeof target === "string") {
    return target.includes("one_owner");
  }
  return Array.isArray(target) && target.some((field) => String(field).includes("one_owner"));
}

/** Une propriété d'un objet d'erreur — sans assertion, et sans supposer sa forme. */
function readField(source: unknown, key: string): unknown {
  return typeof source === "object" && source !== null ? Reflect.get(source, key) : undefined;
}

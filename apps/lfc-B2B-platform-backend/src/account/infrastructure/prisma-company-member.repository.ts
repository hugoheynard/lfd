import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import {
  CompanyMemberReader,
  CompanyMemberRepository,
  type CompanyMemberRecord,
  type CustomerRecord,
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

  async findCustomerByEmail(email: string): Promise<CustomerRecord | null> {
    const user = await this.prisma.user.findFirst({
      // Insensible à la casse : personne ne retape son adresse à l'identique, et
      // « Jean.Dupont@… » ne doit pas ouvrir un second compte.
      where: { email: { equals: email, mode: "insensitive" } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        memberships: {
          select: { company: { select: { id: true, raisonSociale: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (user === null) {
      return null;
    }
    return {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      status: user.status,
      companies: user.memberships.map((membership) => membership.company),
    };
  }
}

/** Adaptateur Prisma de l'**écriture** des accès. */
@Injectable()
export class PrismaCompanyMemberRepository extends CompanyMemberRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findUserIdByEmail(email: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    return user?.id ?? null;
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

  async attach(userId: string, companyId: string, role: CompanyRole): Promise<void> {
    await this.prisma.membership.create({ data: { userId, companyId, role } });
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

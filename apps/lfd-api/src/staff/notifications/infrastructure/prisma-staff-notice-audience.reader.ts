import {
  STAFF_NOTICE_LABELS,
  STAFF_NOTICE_TEMPLATES,
  type StaffNoticeAudiencesView,
  type StaffNoticeMemberView,
  type StaffNoticeRoleView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { StaffNoticeAudienceReader } from "../domain/notice-audience/staff-notice-audience.ports.js";

const SUSPENDED = "suspended";

interface MemberRow {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly status: string;
}

interface RoleRow {
  readonly key: string;
  readonly label: string;
  readonly archivedAt: Date | null;
}

/**
 * L'écran des destinataires : le réglage de chaque avis, et les candidats —
 * rôles non archivés, membres non suspendus. Un rôle ou un membre déjà réglé
 * reste lisible même archivé ou suspendu.
 */
@Injectable()
export class PrismaStaffNoticeAudienceReader extends StaffNoticeAudienceReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async all(): Promise<StaffNoticeAudiencesView> {
    const [rows, roles, members] = await Promise.all([
      this.prisma.staffNoticeAudience.findMany({
        select: { template: true, roleKey: true, staffUserId: true },
      }),
      this.prisma.staffRoleDefinition.findMany({
        orderBy: { label: "asc" },
        select: { key: true, label: true, archivedAt: true },
      }),
      this.prisma.staffUser.findMany({
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
        select: { id: true, firstName: true, lastName: true, email: true, status: true },
      }),
    ]);
    const roleViews = roles.map(toRole);
    const memberViews = members.map(toMember);
    return {
      notices: STAFF_NOTICE_TEMPLATES.map((template) => {
        const mine = rows.filter((row) => row.template === template);
        return {
          template,
          label: STAFF_NOTICE_LABELS[template],
          roles: roleViews.filter((role) => mine.some((row) => row.roleKey === role.key)),
          members: memberViews.filter((m) => mine.some((row) => row.staffUserId === m.staffUserId)),
        };
      }),
      candidates: {
        roles: roleViews.filter((role) => !role.archived),
        members: members.filter((m) => m.status !== SUSPENDED).map(toMember),
      },
    };
  }
}

function toRole(row: RoleRow): StaffNoticeRoleView {
  return { key: row.key, label: row.label, archived: row.archivedAt !== null };
}

function toMember(row: MemberRow): StaffNoticeMemberView {
  return {
    staffUserId: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    reachable: row.status !== SUSPENDED && row.email !== "",
  };
}

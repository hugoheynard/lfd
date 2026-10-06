import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ReachableStaff, StaffContacts, type StaffContact } from "../domain/staff-contacts.js";

const CONTACT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  jobTitle: true,
  status: true,
} as const;

interface ContactRow {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly jobTitle: string;
  readonly status: string;
}

/** Le statut qui ferme toutes les portes — et la boîte aux lettres du fournil. */
const SUSPENDED = "suspended";

/** Adaptateur de {@link StaffContacts} : une lecture de l'annuaire, quel que soit le nombre d'ids. */
@Injectable()
export class PrismaStaffContacts extends StaffContacts {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async contactsOf(staffUserIds: readonly string[]): Promise<ReadonlyMap<string, StaffContact>> {
    const rows: readonly ContactRow[] = await this.prisma.staffUser.findMany({
      where: { id: { in: [...new Set(staffUserIds)] } },
      select: CONTACT_SELECT,
    });
    return new Map(rows.map((row) => [row.id, toContact(row)]));
  }
}

/** Adaptateur de {@link ReachableStaff} : les fiches non suspendues qui ont une adresse. */
@Injectable()
export class PrismaReachableStaff extends ReachableStaff {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly StaffContact[]> {
    const rows: readonly ContactRow[] = await this.prisma.staffUser.findMany({
      where: { status: { not: SUSPENDED }, email: { not: "" } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
      select: CONTACT_SELECT,
    });
    return rows.map(toContact);
  }
}

function toContact(row: ContactRow): StaffContact {
  return {
    staffUserId: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    jobTitle: row.jobTitle,
    active: row.status !== SUSPENDED,
  };
}

import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ACCOUNT_FACTS } from "../../account/domain/events/account-facts.js";
import { SalesOversightTooLargeError } from "../domain/errors/sales-oversight-errors.js";
import { SalesSheetReader, type SalesSheetScope } from "../domain/ports/sales-sheet.reader.js";
import type { SalesSheetFacts } from "../domain/sales-oversight.js";

/** Le statut d'un rendez-vous qui a eu lieu : il compte comme un contact noté. */
const HONORED = "honored";
const COMPANY_SUBJECT = "company";

const SHEET_SELECT = {
  id: true,
  reference: true,
  raisonSociale: true,
  enseigne: true,
  contactPrenom: true,
  contactNom: true,
  contactEmail: true,
  contactTelephone: true,
  createdAt: true,
  activatedAt: true,
  declaredVia: true,
  followedByStaffId: true,
  preferredFulfillmentMethod: true,
  groupWithoutDelivery: true,
} as const;

type SheetRow = Awaited<ReturnType<typeof readCompanies>>[number];

/** Ce que les lectures par lot ont rassemblé, par société. */
interface SheetBatch {
  readonly billing: ReadonlySet<string>;
  readonly deliveries: ReadonlyMap<string, number>;
  readonly loggedIn: ReadonlySet<string>;
  readonly ordered: ReadonlySet<string>;
  readonly contacts: ReadonlyMap<string, number>;
}

/**
 * Les fiches du suivi commercial, en **six lectures** quel que soit leur
 * nombre : la liste, puis adresses, détenteurs connectés, commandes, contacts
 * notés et rendez-vous honorés, chacune par lot sur tous les ids.
 *
 * Il lit directement les tables du compte et des commandes, comme les autres
 * lecteurs de `growth` (`prisma-portfolio-metrics.reader.ts`) : le bloc est le
 * même. Les coordonnées du contact ne quittent pas l'adaptateur autrement que
 * dans l'entrée du calcul de niveau, qui n'en tire qu'une présence.
 */
@Injectable()
export class PrismaSalesSheetReader extends SalesSheetReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(scope: SalesSheetScope, limit: number): Promise<readonly SalesSheetFacts[]> {
    const rows = await readCompanies(this.prisma, scope, limit);
    if (rows.length > limit) {
      throw new SalesOversightTooLargeError(limit);
    }
    const batch = await this.batch(rows.map((row) => row.id));
    return rows.map((row) => toFacts(row, batch));
  }

  async followerIds(): Promise<readonly string[]> {
    const rows = await this.prisma.company.findMany({
      where: { parentCompanyId: null, followedByStaffId: { not: null } },
      distinct: ["followedByStaffId"],
      select: { followedByStaffId: true },
    });
    return rows.flatMap((row) => (row.followedByStaffId === null ? [] : [row.followedByStaffId]));
  }

  private async batch(ids: readonly string[]): Promise<SheetBatch> {
    const companyId = { in: [...ids] };
    const [addresses, owners, orders, noted, honored] = await Promise.all([
      this.prisma.address.groupBy({
        by: ["companyId", "kind"],
        where: { companyId, archivedAt: null },
        _count: { _all: true },
      }),
      this.prisma.membership.findMany({
        where: { companyId, role: "owner", user: { firstLoginAt: { not: null } } },
        distinct: ["companyId"],
        select: { companyId: true },
      }),
      this.prisma.order.findMany({
        where: { companyId },
        distinct: ["companyId"],
        select: { companyId: true },
      }),
      this.prisma.activityEvent.groupBy({
        by: ["subjectId"],
        where: {
          type: ACCOUNT_FACTS.companyContacted,
          subjectType: COMPANY_SUBJECT,
          subjectId: companyId,
        },
        _count: { _all: true },
      }),
      this.prisma.appointment.groupBy({
        by: ["subjectId"],
        where: { status: HONORED, subjectType: COMPANY_SUBJECT, subjectId: companyId },
        _count: { _all: true },
      }),
    ]);
    const contacts = new Map<string, number>();
    for (const row of [...noted, ...honored]) {
      contacts.set(row.subjectId, (contacts.get(row.subjectId) ?? 0) + row._count._all);
    }
    return {
      billing: new Set(
        addresses.filter((row) => row.kind === "billing").map((row) => row.companyId),
      ),
      deliveries: new Map(
        addresses
          .filter((row) => row.kind === "delivery")
          .map((row) => [row.companyId, row._count._all]),
      ),
      loggedIn: new Set(owners.map((row) => row.companyId)),
      ordered: new Set(orders.flatMap((row) => (row.companyId === null ? [] : [row.companyId]))),
      contacts,
    };
  }
}

/** Les fiches principales du filtre, une de plus que la borne. */
function readCompanies(prisma: PrismaService, scope: SalesSheetScope, limit: number) {
  return prisma.company.findMany({
    where: {
      parentCompanyId: null,
      ...(scope.followedBy === undefined ? {} : { followedByStaffId: scope.followedBy }),
      ...(scope.channel === undefined ? {} : { declaredVia: scope.channel }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    // Une de plus que la borne : c'est elle qui dit que la borne est franchie.
    take: limit + 1,
    select: SHEET_SELECT,
  });
}

function toFacts(row: SheetRow, batch: SheetBatch): SalesSheetFacts {
  return {
    companyId: row.id,
    reference: row.reference,
    name: row.enseigne.trim() === "" ? row.raisonSociale : row.enseigne,
    createdAt: row.createdAt,
    declaredVia: row.declaredVia,
    followedByStaffId: row.followedByStaffId,
    work: {
      interlocutor: {
        name: `${row.contactPrenom} ${row.contactNom}`.trim(),
        email: row.contactEmail,
        phone: row.contactTelephone,
      },
      notedContacts: batch.contacts.get(row.id) ?? 0,
      hasBillingAddress: batch.billing.has(row.id),
      deliveryAddressCount: batch.deliveries.get(row.id) ?? 0,
      noDeliveryAddressNeeded:
        row.preferredFulfillmentMethod === "pickup" || row.groupWithoutDelivery,
      holderLoggedIn: batch.loggedIn.has(row.id),
      activated: row.activatedAt !== null,
      hasOrder: batch.ordered.has(row.id),
    },
  };
}

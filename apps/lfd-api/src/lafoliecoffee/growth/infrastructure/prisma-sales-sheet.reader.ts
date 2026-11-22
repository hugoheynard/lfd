import { instantToLocal } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { ACCOUNT_FACTS } from "../../account/domain/events/account-facts.js";
import { SalesOversightTooLargeError } from "../domain/errors/sales-oversight-errors.js";
import { SalesSheetReader, type SalesSheetScope } from "../domain/ports/sales-sheet.reader.js";
import type { SalesSheetFacts } from "../domain/sales-oversight.js";
import type { SheetMilestones } from "../domain/sales-today.js";
import type { SheetStepFacts } from "../domain/sheet-steps.js";
import { DEFAULT_BILLING_MODE } from "../../accounting/domain/value-objects/billing-mode.js";
import { DEFAULT_COLLECTION_MEANS } from "../../accounting/domain/value-objects/collection-means.js";
import { notedContactOf } from "./noted-contact-payload.js";
import { readStepBatch, type StepBatch } from "./sales-sheet-steps.batch.js";

/** Le statut d'un rendez-vous qui a eu lieu : il compte comme un contact noté. */
const HONORED = "honored";
const COMPANY_SUBJECT = "company";
/** Les étapes du parcours qui datent « Qualifiée » : les deux adresses. */
const QUALIFYING_STEPS: ReadonlySet<unknown> = new Set(["billing", "delivery"]);

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
  formeJuridique: true,
  siret: true,
  vatNumber: true,
  grantedTerms: true,
  requestedTerm: true,
  directDebitBlockedAt: true,
  kbisUploadedAt: true,
  kbisCertifiedAt: true,
} as const;

/** Les défauts de la comptabilité : jamais atteints, `readStepBatch` lit chaque id. */
const DEFAULT_COLLECTION = { rhythm: DEFAULT_BILLING_MODE, means: DEFAULT_COLLECTION_MEANS };

type SheetRow = Awaited<ReturnType<typeof readCompanies>>[number];

/** Ce que les lectures par lot ont rassemblé, par société. */
interface SheetBatch {
  readonly billing: ReadonlySet<string>;
  readonly deliveries: ReadonlyMap<string, number>;
  readonly loggedIn: ReadonlyMap<string, Date>;
  readonly ordered: ReadonlyMap<string, Date>;
  readonly orderCounts: ReadonlyMap<string, number>;
  readonly contacts: ReadonlyMap<string, number>;
  readonly firstContactDays: ReadonlyMap<string, string>;
  readonly lastContactDays: ReadonlyMap<string, string>;
  readonly qualifiedSteps: ReadonlyMap<string, Date>;
}

/**
 * Les fiches du suivi commercial, en **treize lectures** quel que soit leur
 * nombre : la liste, puis adresses, détenteurs connectés, commandes, contacts
 * notés, rendez-vous honorés et étapes d'adresse franchies, chacune par lot
 * sur tous les ids ; et les six de la grille d'étapes (`readStepBatch`).
 *
 * Il lit directement les tables du compte et des commandes, comme les autres
 * lecteurs de `growth` (`prisma-portfolio-metrics.reader.ts`) : le bloc est le
 * même. Les coordonnées du contact ne quittent pas l'adaptateur autrement que
 * dans l'entrée du calcul de niveau, qui n'en tire qu'une présence.
 */
@Injectable()
export class PrismaSalesSheetReader extends SalesSheetReader {
  constructor(
    private readonly prisma: PrismaService,
    /** Le rythme et le moyen du payeur se lisent à l'instant de la requête. */
    private readonly clock: Clock,
  ) {
    super();
  }

  async read(scope: SalesSheetScope, limit: number): Promise<readonly SalesSheetFacts[]> {
    const rows = await readCompanies(this.prisma, scope, limit);
    if (rows.length > limit) {
      throw new SalesOversightTooLargeError(limit);
    }
    const ids = rows.map((row) => row.id);
    const [batch, steps] = await Promise.all([
      this.batch(ids),
      readStepBatch(this.prisma, ids, this.clock.now()),
    ]);
    return rows.map((row) => toFacts(row, batch, steps));
  }

  async followerIds(): Promise<readonly string[]> {
    const rows = await this.prisma.company.findMany({
      where: { parentCompanyId: null, archivedAt: null, followedByStaffId: { not: null } },
      distinct: ["followedByStaffId"],
      select: { followedByStaffId: true },
    });
    return rows.flatMap((row) => (row.followedByStaffId === null ? [] : [row.followedByStaffId]));
  }

  private async batch(ids: readonly string[]): Promise<SheetBatch> {
    const companyId = { in: [...ids] };
    const [addresses, owners, orders, noted, honored, steps] = await Promise.all([
      this.prisma.address.groupBy({
        by: ["companyId", "kind"],
        where: { companyId, archivedAt: null },
        _count: { _all: true },
      }),
      this.prisma.membership.findMany({
        where: { companyId, role: "owner", user: { firstLoginAt: { not: null } } },
        select: { companyId: true, user: { select: { firstLoginAt: true } } },
      }),
      this.prisma.order.groupBy({
        by: ["companyId"],
        where: { companyId },
        _min: { createdAt: true },
        _count: { _all: true },
      }),
      this.prisma.activityEvent.findMany({
        where: {
          type: ACCOUNT_FACTS.companyContacted,
          subjectType: COMPANY_SUBJECT,
          subjectId: companyId,
        },
        select: { subjectId: true, payload: true },
      }),
      this.prisma.appointment.findMany({
        where: { status: HONORED, subjectType: COMPANY_SUBJECT, subjectId: companyId },
        select: { subjectId: true, startAt: true },
      }),
      this.prisma.activityEvent.findMany({
        where: {
          type: ACCOUNT_FACTS.companyStepReached,
          subjectType: COMPANY_SUBJECT,
          subjectId: companyId,
        },
        select: { subjectId: true, payload: true, occurredAt: true },
      }),
    ]);
    const contactDays = [
      ...noted.map((row) => ({ id: row.subjectId, day: notedContactOf(row.payload)?.date })),
      ...honored.map((row) => ({ id: row.subjectId, day: instantToLocal(row.startAt).day })),
    ];
    return {
      billing: new Set(
        addresses.filter((row) => row.kind === "billing").map((row) => row.companyId),
      ),
      deliveries: new Map(
        addresses
          .filter((row) => row.kind === "delivery")
          .map((row) => [row.companyId, row._count._all]),
      ),
      loggedIn: earliestBy(
        owners.flatMap((row) =>
          row.user.firstLoginAt === null ? [] : [[row.companyId, row.user.firstLoginAt] as const],
        ),
      ),
      ordered: earliestBy(
        orders.flatMap((row) =>
          row.companyId === null || row._min.createdAt === null
            ? []
            : [[row.companyId, row._min.createdAt] as const],
        ),
      ),
      orderCounts: new Map(
        orders.flatMap((row) =>
          row.companyId === null ? [] : [[row.companyId, row._count._all] as const],
        ),
      ),
      contacts: countBy(contactDays.map((row) => row.id)),
      firstContactDays: earliestBy(
        contactDays.flatMap((row) => (row.day === undefined ? [] : [[row.id, row.day] as const])),
      ),
      lastContactDays: latestBy(
        contactDays.flatMap((row) => (row.day === undefined ? [] : [[row.id, row.day] as const])),
      ),
      qualifiedSteps: latestBy(
        steps.flatMap((row) =>
          QUALIFYING_STEPS.has(stepOf(row.payload))
            ? [[row.subjectId, row.occurredAt] as const]
            : [],
        ),
      ),
    };
  }
}

/** Les fiches principales du filtre, une de plus que la borne. */
function readCompanies(prisma: PrismaService, scope: SalesSheetScope, limit: number) {
  return prisma.company.findMany({
    where: {
      parentCompanyId: null,
      // Un compte supprimé sort du suivi commercial ; un résilié y reste.
      archivedAt: null,
      ...(scope.followedBy === undefined ? {} : { followedByStaffId: scope.followedBy }),
      ...(scope.channel === undefined ? {} : { declaredVia: scope.channel }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    // Une de plus que la borne : c'est elle qui dit que la borne est franchie.
    take: limit + 1,
    select: SHEET_SELECT,
  });
}

function toFacts(row: SheetRow, batch: SheetBatch, steps: StepBatch): SalesSheetFacts {
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
    milestones: milestonesOf(row, batch),
    steps: stepFactsOf(row, batch, steps),
  };
}

function stepFactsOf(row: SheetRow, batch: SheetBatch, steps: StepBatch): SheetStepFacts {
  return {
    legal: {
      raisonSociale: row.raisonSociale,
      formeJuridique: row.formeJuridique,
      siret: row.siret,
      vatNumber: row.vatNumber,
      primaryPhone: row.contactTelephone,
      otherPhones: steps.otherPhones.get(row.id) ?? [],
    },
    kbis: { uploadedAt: row.kbisUploadedAt, certifiedAt: row.kbisCertifiedAt },
    terms: { granted: row.grantedTerms, requested: row.requestedTerm },
    collection: steps.collection.get(row.id) ?? DEFAULT_COLLECTION,
    hasBankAccount: steps.bankAccounts.has(row.id),
    hasActiveMandate: steps.activeMandates.has(row.id),
    directDebitBlocked: row.directDebitBlockedAt !== null,
    orderCount: batch.orderCounts.get(row.id) ?? 0,
    lastContactDay: batch.lastContactDays.get(row.id) ?? null,
  };
}

function milestonesOf(row: SheetRow, batch: SheetBatch): SheetMilestones {
  return {
    firstContactDay: batch.firstContactDays.get(row.id) ?? null,
    qualifiedStepAt: batch.qualifiedSteps.get(row.id) ?? null,
    holderFirstLoginAt: batch.loggedIn.get(row.id) ?? null,
    activatedAt: row.activatedAt,
    firstOrderAt: batch.ordered.get(row.id) ?? null,
  };
}

/** L'étape d'un `company.step_reached`, telle qu'écrite ; `undefined` hors forme. */
function stepOf(payload: unknown): unknown {
  return typeof payload === "object" && payload !== null && "step" in payload
    ? payload.step
    : undefined;
}

function countBy(ids: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** La plus petite valeur par société (un jour `AAAA-MM-JJ` se compare comme un texte). */
function earliestBy<T extends Date | string>(
  pairs: readonly (readonly [string, T])[],
): ReadonlyMap<string, T> {
  const found = new Map<string, T>();
  for (const [id, value] of pairs) {
    const known = found.get(id);
    if (known === undefined || value < known) {
      found.set(id, value);
    }
  }
  return found;
}

/** La plus grande valeur par société (un jour `AAAA-MM-JJ` se compare comme un texte). */
function latestBy<T extends Date | string>(
  pairs: readonly (readonly [string, T])[],
): ReadonlyMap<string, T> {
  const found = new Map<string, T>();
  for (const [id, value] of pairs) {
    const known = found.get(id);
    if (known === undefined || value > known) {
      found.set(id, value);
    }
  }
  return found;
}

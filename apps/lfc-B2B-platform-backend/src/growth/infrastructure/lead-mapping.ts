import type { LeadStatus, LeadView } from "@lfd/contracts";

import { Lead } from "../domain/entities/lead.js";

/** Tous les statuts valides (narrowing défensif — pas de contrainte SQL sur `status`). */
const STATUSES: readonly LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "negotiating",
  "converted",
  "lost",
];

/** Statuts **actifs** (non clos) — la file de démarchage. */
export const ACTIVE_LEAD_STATUSES: readonly LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "negotiating",
];

/** Forme d'une ligne `leads` lue par Prisma (colonnes projetées). */
export interface LeadRow {
  readonly id: string;
  readonly businessName: string;
  readonly contactName: string;
  readonly email: string;
  readonly phone: string;
  readonly siret: string;
  readonly status: string;
  readonly notes: string;
  readonly linkedUserId: string | null;
  readonly createdAt: Date;
  readonly lastContactedAt: Date | null;
}

function isStatus(value: string): value is LeadStatus {
  return (STATUSES as readonly string[]).includes(value);
}

export function toLeadStatus(value: string): LeadStatus {
  return isStatus(value) ? value : "new";
}

/** Reconstitue l'agrégat depuis une ligne (pour la mutation). */
export function rowToLead(row: LeadRow): Lead {
  return Lead.reconstitute({
    id: row.id,
    businessName: row.businessName,
    contactName: row.contactName,
    email: row.email,
    phone: row.phone,
    siret: row.siret,
    notes: row.notes,
    status: toLeadStatus(row.status),
    linkedUserId: row.linkedUserId,
    lastContactedAt: row.lastContactedAt,
  });
}

/** Mappe une ligne vers la vue plate rendue au staff. */
export function rowToLeadView(row: LeadRow): LeadView {
  return {
    id: row.id,
    businessName: row.businessName,
    contactName: row.contactName,
    email: row.email,
    phone: row.phone,
    siret: row.siret,
    status: toLeadStatus(row.status),
    notes: row.notes,
    linkedUserId: row.linkedUserId,
    createdAt: row.createdAt.toISOString(),
    lastContactedAt: row.lastContactedAt?.toISOString() ?? null,
  };
}

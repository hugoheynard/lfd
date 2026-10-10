import { appointmentPurposeSchema } from "@lfd/contracts";
import type { AppointmentPurpose, SupportRequestView, SupportSlot } from "@lfd/contracts";

/**
 * Le motif relu de la base. Colonne texte (pas d'enum Postgres) : on **renarrow**
 * par le schéma du contrat plutôt que de faire confiance à la ligne — un `as`
 * mensonger se propagerait jusqu'au front. Un motif inconnu retombe sur « autre ».
 *
 * Passe par le schéma et non par le vocabulaire de `growth` : les deux contextes
 * partagent le contrat, pas leurs adaptateurs.
 */
function toPurpose(value: string): AppointmentPurpose {
  const parsed = appointmentPurposeSchema.safeParse(value);
  return parsed.success ? parsed.data : "other";
}

/**
 * Une ligne `support_requests` vers la vue plate rendue au staff. Partagée par
 * le dépôt (la file) et le lecteur (le courriel à l'équipe) : une demande se
 * lit de la même façon des deux côtés.
 */
export function toSupportRequestView(row: {
  id: string;
  companyId: string | null;
  requestedByUserId: string;
  channel: string;
  purpose: string;
  phoneNumber: string;
  asap: boolean;
  scheduledDate: Date | null;
  slot: string | null;
  message: string;
  handledAt: Date | null;
  createdAt: Date;
}): SupportRequestView {
  return {
    id: row.id,
    companyId: row.companyId,
    requestedByUserId: row.requestedByUserId,
    channel: row.channel === "email" ? "email" : "phone",
    purpose: toPurpose(row.purpose),
    phoneNumber: row.phoneNumber,
    asap: row.asap,
    // Colonne DATE : on garde le jour tel quel, sans passer par un fuseau qui
    // pourrait le décaler d'un cran.
    scheduledDate: row.scheduledDate === null ? null : row.scheduledDate.toISOString().slice(0, 10),
    slot: toSlot(row.slot),
    message: row.message,
    handledAt: row.handledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSlot(value: string | null): SupportSlot | null {
  if (value === "morning" || value === "afternoon") {
    return value;
  }
  return null;
}

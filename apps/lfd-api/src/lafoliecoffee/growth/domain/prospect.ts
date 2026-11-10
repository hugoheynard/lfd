import type { ActiveLeadStatus, LeadStatus, LeadView, ProspectView } from "@lfd/contracts";

/**
 * Projection **Prospects** — les établissements démarchés qui ne sont pas encore
 * clients. Pure : elle lit les leads (agrégat `Lead`) et n'a besoin d'aucune
 * horloge, le « depuis » étant une date que l'écran met en forme.
 *
 * Jusqu'au 2026-10-25, elle dérivait aussi du journal des **personnes** — `hot`
 * (commande sans société) et `mid` (inscrit sans commande). Depuis que la
 * boutique sert les particuliers, c'étaient des clients particuliers : le lot
 * P3 de `documentation/b2b/plan-auto-acquisition-pro.md` les a sortis du poste
 * commercial (décision de Hugo, Q1).
 */

/** Les étapes ouvertes — un lead converti ou perdu a quitté la file. */
const ACTIVE_LEAD_STATUSES: readonly ActiveLeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "negotiating",
];

function isActive(status: LeadStatus): status is ActiveLeadStatus {
  return (ACTIVE_LEAD_STATUSES as readonly LeadStatus[]).includes(status);
}

/**
 * La file Prospects : les leads à une étape ouverte, le plus récemment touché
 * en tête (dernier contact, sinon saisie).
 */
export function prospectsFrom(leads: readonly LeadView[]): ProspectView[] {
  const prospects: ProspectView[] = [];
  for (const lead of leads) {
    const status = lead.status;
    if (!isActive(status)) {
      continue;
    }
    prospects.push({
      leadId: lead.id,
      businessName: lead.businessName,
      contactName: lead.contactName,
      phone: lead.phone,
      email: lead.email,
      status,
      capturedAt: lead.createdAt,
      lastContactedAt: lead.lastContactedAt,
    });
  }
  return prospects.sort((a, b) => lastTouchOf(b) - lastTouchOf(a));
}

function lastTouchOf(prospect: ProspectView): number {
  return new Date(prospect.lastContactedAt ?? prospect.capturedAt).getTime();
}

import {
  foldDaysBetween,
  type FoldCalendarEvent,
  type FoldCalendarSource,
  type FoldCalendarTone,
} from 'fold-ng';

import type { AdminCompany } from '../../comptes-clients/admin-company';

/**
 * Projection **pure** des sociétés admin sur le calendrier d'acquisition du
 * commercial — testable sans rendu. Le calendrier fold est un *affichage* : c'est
 * ici que l'app décide quoi tracer et de quelle teinte, jamais le composant.
 *
 * Trois flux (sourceKey), filtrables par les chips :
 * - `inscriptions` — chaque société, un repère le jour de son `createdAt` ;
 * - `attente` — les `pending` **sans** demande d'assistance : une bande ouverte
 *   du jour d'inscription à aujourd'hui, dont la **teinte monte avec la durée**
 *   (l'événement continu register→activation du design) ;
 * - `rdv` — les `pending` **avec** demande d'assistance (`hasOpenSupportRequest`,
 *   le client veut être rappelé) : la file des rappels de création à traiter.
 */

/** La donnée métier promenée sur chaque événement, rendue telle quelle à l'appelant. */
export type AcquisitionEvent = FoldCalendarEvent<AdminCompany>;

/** Les trois flux, pour les chips `fold-calendar-source-filter`. */
export const ACQUISITION_SOURCES: readonly FoldCalendarSource[] = [
  { key: 'inscriptions', label: 'Inscriptions', tone: 'success' },
  { key: 'attente', label: 'En attente', tone: 'warning' },
  { key: 'rdv', label: 'RDV création', tone: 'alert' },
];

/** Jours d'attente à partir desquels la bande passe à l'ambre. */
export const PENDING_WARNING_DAYS = 7;
/** Jours d'attente à partir desquels la bande passe au rouge. */
export const PENDING_ALERT_DAYS = 14;

/** Le jour ISO (`YYYY-MM-DD`) d'un `createdAt` horodaté. */
function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/** Teinte d'une attente selon sa durée — neutre, puis ambre, puis rouge. */
function pendingTone(days: number): FoldCalendarTone {
  if (days >= PENDING_ALERT_DAYS) {
    return 'alert';
  }
  if (days >= PENDING_WARNING_DAYS) {
    return 'warning';
  }
  return 'neutral';
}

/** Nom lisible d'une société : l'enseigne, sinon la raison sociale. */
function companyLabel(company: AdminCompany): string {
  const enseigne = company.enseigne.trim();
  return enseigne === '' ? company.raisonSociale : enseigne;
}

/** Le repère d'inscription : un événement d'un jour, le jour du `createdAt`. */
function inscription(company: AdminCompany): AcquisitionEvent {
  const day = dayOf(company.createdAt);
  return {
    id: `insc:${company.id}`,
    start: day,
    end: day,
    label: companyLabel(company),
    subline: company.reference,
    tone: 'success',
    sourceKey: 'inscriptions',
    data: company,
  };
}

/**
 * La bande d'attente d'une société `pending` : ouverte du jour d'inscription à
 * `today` (elle continue tant que le compte n'est pas activé), teintée par sa
 * durée, et rangée dans `rdv` ou `attente` selon qu'un rappel a été demandé.
 */
function pendingBand(company: AdminCompany, today: string): AcquisitionEvent {
  const day = dayOf(company.createdAt);
  const days = Math.max(0, foldDaysBetween(day, today));
  const isRdv = company.hasOpenSupportRequest;
  return {
    id: `${isRdv ? 'rdv' : 'att'}:${company.id}`,
    start: day,
    end: today,
    openEnd: true,
    label: companyLabel(company),
    subline: isRdv ? 'Rappel demandé' : `En attente depuis ${days} j`,
    tone: isRdv ? 'alert' : pendingTone(days),
    sourceKey: isRdv ? 'rdv' : 'attente',
    data: company,
  };
}

/**
 * Les événements du calendrier d'acquisition : un repère d'inscription par
 * société, plus une bande d'attente pour chaque société encore `pending`.
 *
 * `today` est passé (jamais lu d'une horloge ici) — pur et SSR-stable.
 */
export function buildAcquisitionEvents(
  companies: readonly AdminCompany[],
  today: string,
): readonly AcquisitionEvent[] {
  const events: AcquisitionEvent[] = [];
  for (const company of companies) {
    events.push(inscription(company));
    if (company.status === 'pending') {
      events.push(pendingBand(company, today));
    }
  }
  return events;
}

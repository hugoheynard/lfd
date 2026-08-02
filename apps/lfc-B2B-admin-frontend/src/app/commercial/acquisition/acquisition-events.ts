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
 *   d'attente d'activation (les seuils viennent des réglages) ;
 * - `rdv` — les `pending` **avec** demande d'assistance (`hasOpenSupportRequest`,
 *   le client veut être rappelé) : la file des rappels de création à traiter.
 */

/** La donnée métier promenée sur chaque événement, rendue telle quelle à l'appelant. */
export type AcquisitionEvent = FoldCalendarEvent<AdminCompany>;

/** Les seuils (jours d'attente d'activation) qui font monter la teinte d'un créneau. */
export interface AcquisitionThresholds {
  /** Jours à partir desquels un créneau en attente passe en ambre. */
  readonly warnDays: number;
  /** Jours à partir desquels il passe en rouge. */
  readonly alertDays: number;
}

/** Seuils par défaut, si l'appelant n'en fournit pas. */
export const DEFAULT_ACQUISITION_THRESHOLDS: AcquisitionThresholds = {
  warnDays: 7,
  alertDays: 14,
};

/** Les trois flux, pour les chips `fold-calendar-source-filter`. */
export const ACQUISITION_SOURCES: readonly FoldCalendarSource[] = [
  { key: 'inscriptions', label: 'Inscriptions', tone: 'success' },
  { key: 'attente', label: 'En attente', tone: 'warning' },
  { key: 'rdv', label: 'RDV création', tone: 'alert' },
];

/** Le jour ISO (`YYYY-MM-DD`) d'un `createdAt` horodaté. */
function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/** Teinte d'une attente selon sa durée et les seuils — neutre, ambre, puis rouge. */
function pendingTone(days: number, thresholds: AcquisitionThresholds): FoldCalendarTone {
  if (days >= thresholds.alertDays) {
    return 'alert';
  }
  if (days >= thresholds.warnDays) {
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
 * durée et les seuils, rangée dans `rdv` ou `attente` selon qu'un rappel a été
 * demandé.
 */
function pendingBand(
  company: AdminCompany,
  today: string,
  thresholds: AcquisitionThresholds,
): AcquisitionEvent {
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
    tone: isRdv ? 'alert' : pendingTone(days, thresholds),
    sourceKey: isRdv ? 'rdv' : 'attente',
    data: company,
  };
}

/**
 * Les événements du calendrier d'acquisition : un repère d'inscription par
 * société, plus une bande d'attente pour chaque société encore `pending`.
 *
 * `today` est passé (jamais lu d'une horloge ici) — pur et SSR-stable ; les
 * `thresholds` viennent des réglages, sinon des défauts.
 */
export function buildAcquisitionEvents(
  companies: readonly AdminCompany[],
  today: string,
  thresholds: AcquisitionThresholds = DEFAULT_ACQUISITION_THRESHOLDS,
): readonly AcquisitionEvent[] {
  const events: AcquisitionEvent[] = [];
  for (const company of companies) {
    events.push(inscription(company));
    if (company.status === 'pending') {
      events.push(pendingBand(company, today, thresholds));
    }
  }
  return events;
}

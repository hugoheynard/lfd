import type {
  DeliveryIncidentFamily,
  DeliveryIncidentView,
  DeliveryStopOrderState,
} from '@lfd/contracts';
import { DELIVERY_INCIDENT_REASONS } from '@lfd/contracts';
import type { FoldSelectOption } from 'fold-ng';

import { parisTimeOf } from './delivery-loading';

/**
 * **Les signalements à la porte, en mots** (`documentation/livraisons/a-la-porte.md`,
 * § 3). Les familles et les motifs viennent de la liste FERMÉE du contrat : un
 * motif ajouté au serveur sans libellé ici s'affiche sous son code plutôt que
 * de disparaître.
 */
export const INCIDENT_FAMILY_LABELS: Readonly<Record<DeliveryIncidentFamily, string>> = {
  doorstep: 'Problème à la remise',
  technical: 'Problème technique',
  road: 'Problème routier',
};

const REASON_LABELS: Readonly<Record<string, string>> = {
  nobody_present: 'Personne pour réceptionner',
  refused: 'Refus',
  address_not_found: 'Adresse introuvable',
  access_impossible: 'Accès impossible',
  goods_damaged: 'Marchandise abîmée',
  vehicle_breakdown: 'Panne du véhicule',
  cold_failure: 'Froid défaillant',
  phone_or_app: 'Téléphone ou application',
  bin_damaged: 'Bac endommagé',
  road_closed: 'Route fermée',
  accident: 'Accident',
  weather_conditions: 'Conditions (neige, verglas)',
  traffic_jam: 'Bouchon',
  other: 'Autre',
};

/** Le motif en toutes lettres, ou son code s'il est inconnu de l'écran. */
export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}

/** Les familles proposées, dans l'ordre donné. */
export function familyOptions(
  families: readonly DeliveryIncidentFamily[],
): readonly FoldSelectOption<DeliveryIncidentFamily>[] {
  return families.map((family) => ({ value: family, label: INCIDENT_FAMILY_LABELS[family] }));
}

/** Les motifs d'une famille, tels que le serveur les accepte. */
export function reasonOptions(family: DeliveryIncidentFamily): readonly FoldSelectOption<string>[] {
  return DELIVERY_INCIDENT_REASONS[family].map((reason) => ({
    value: reason,
    label: reasonLabel(reason),
  }));
}

/** « Problème à la remise · Refus » */
export function incidentTitleOf(incident: Pick<DeliveryIncidentView, 'family' | 'reason'>): string {
  return `${INCIDENT_FAMILY_LABELS[incident.family]} · ${reasonLabel(incident.reason)}`;
}

/** « Signalé à 9 h 12 par Léa Martin » — l'auteur peut manquer à l'annuaire. */
export function incidentSubtitleOf(
  incident: Pick<DeliveryIncidentView, 'reportedAt' | 'reportedBy' | 'orderReference'>,
): string {
  const by = incident.reportedBy.name === null ? '' : ` par ${incident.reportedBy.name}`;
  const order = incident.orderReference === null ? '' : ` · ${incident.orderReference}`;
  return `Signalé à ${parisTimeOf(incident.reportedAt)}${by}${order}`;
}

/** « 1 signalement », « 3 signalements ». */
export function incidentCountLabel(count: number): string {
  return count === 1 ? '1 signalement' : `${String(count)} signalements`;
}

/** Les signalements d'une tournée, puis ceux d'un de ses arrêts. */
export function incidentsOfRound(
  incidents: readonly DeliveryIncidentView[],
  roundId: string,
): readonly DeliveryIncidentView[] {
  return incidents.filter((incident) => incident.roundId === roundId);
}

export function incidentsOfStop(
  incidents: readonly DeliveryIncidentView[],
  stopId: string,
): readonly DeliveryIncidentView[] {
  return incidents.filter((incident) => incident.stopId === stopId);
}

/**
 * Le geste « Clore sans remise » et ses mots — `null` quand la commande est à
 * remettre : le geste n'existe alors pas (AP-D2, filet invisible du § 9).
 */
export function closeWithoutHandoverLabel(state: DeliveryStopOrderState): string | null {
  switch (state) {
    case 'handed_over':
      return 'Déjà retirée au comptoir';
    case 'cancelled':
      return 'Annulée';
    case 'open':
      return null;
  }
}

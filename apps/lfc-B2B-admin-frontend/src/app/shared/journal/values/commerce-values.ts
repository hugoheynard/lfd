import { domain, type ValueFamily } from './value-domain';

/**
 * **Le commerce** — prospects, rendez-vous, recommandations du cockpit
 * (famille `commerce` du catalogue des faits).
 */

/** L'étape où un prospect est passé (`lead.stage_changed`). */
export const LEAD_STATUS = domain('étape d’un prospect', {
  contacted: 'Contacté',
  qualified: 'Qualifié',
  negotiating: 'En négociation',
  converted: 'Converti',
  lost: 'Perdu',
});

/**
 * Les mêmes mots que le calendrier du commercial (`appointment-events.ts`,
 * `rendez-vous-page.ts`, `booking-policy-card.ts` — trois copies privées,
 * vérifié le 2026-09-19).
 */
export const APPOINTMENT_CHANNEL = domain('canal d’un rendez-vous', {
  phone: 'Téléphone',
  visio: 'Visio',
  onsite: 'Sur place',
});

/** Les mêmes mots que la file du cockpit (`play-queue.ts`, `PLAY`, vérifié le 2026-09-19). */
export const PLAY = domain('coup recommandé', {
  lock_in: 'Verrouiller',
  rescue: 'Rescousse',
  upgrade: 'Upgrade',
  win_back: 'Reconquête',
  nurture: 'Démarchage',
});

export const COMMERCE_VALUES: ValueFamily = {
  enums: [LEAD_STATUS, APPOINTMENT_CHANNEL, PLAY],
  literals: {
    // `lead.converted` : converti à la main, ou rapproché à l'inscription.
    manual: 'À la main',
    registration: 'À l’inscription du client',
  },
};

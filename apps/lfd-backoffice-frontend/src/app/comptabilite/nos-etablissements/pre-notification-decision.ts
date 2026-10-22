/**
 * **La décision écrite de pré-notification** (Q6 du plan
 * `documentation/comptabilite/prelevement/plan-prelevement-d-essai.md`,
 * Hugo, 2026-10-22). Un débit SEPA réel exige d'avertir le débiteur ; pour
 * nos propres établissements, cette décision tient lieu d'avis, et la page qui
 * les déclare l'affiche.
 *
 * Elle se change ici, et seulement par une nouvelle décision datée.
 */
export const PRE_NOTIFICATION_DECISION = {
  day: '2026-10-22',
  dayLabel: '22 octobre 2026',
  text: 'Les essais sur nos propres établissements ne font pas l’objet d’une pré-notification individuelle.',
} as const;

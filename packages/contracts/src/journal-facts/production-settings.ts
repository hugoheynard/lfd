import { z } from "zod";

import { clockTime, count, day, fact, payload, subjectLabel } from "./fact.js";

/**
 * **Les réglages du fournil** (plan `documentation/production/arret-du-plan.md`,
 * lot A1, 2026-10-06) — l'arrêt du plan automatique ou manuel, et les jours
 * fermés.
 *
 * Le réglage d'arrêt est unique : son sujet n'a pas d'autre nom que son type,
 * d'où l'absence de `subjectLabel`. Un jour fermé se nomme par sa date.
 */
const closeSettings = () =>
  payload({
    mode: z.enum(["auto", "manual"]),
    closeAt: clockTime().nullable(),
    alertAt: clockTime().nullable(),
  });

const closedDay = () => payload({ subjectLabel: subjectLabel(), serviceDay: day() });

/**
 * Un destinataire du dossier du jour (plan `dossier-prod-du-jour.md`, E2),
 * nommé « Prénom Nom » au moment du geste. Son adresse n'y est PAS : le
 * journal n'écrit aucun e-mail (`closure.spec.ts`). `staffUserId` dit si
 * c'était une fiche du personnel.
 */
const dossierRecipient = () =>
  payload({
    subjectLabel: subjectLabel(),
    kind: z.enum(["staff", "external"]),
    staffUserId: z.string().nullable(),
  });

export const PRODUCTION_SETTINGS_FACTS = {
  /** Le mode ou une heure a changé. `before` est le réglage en vigueur, défaut compris. */
  "production_settings.close_changed": fact(
    payload({ before: closeSettings(), after: closeSettings() }),
  ),
  /** Un jour où le fournil ne produit pas. */
  "production_closed_day.added": fact(closedDay()),
  /** Ce jour redevient un jour de production. */
  "production_closed_day.removed": fact(closedDay()),
  /** Une personne recevra le dossier du jour à chaque arrêt du plan. */
  "production_dossier_recipient.added": fact(dossierRecipient()),
  /** Elle ne le recevra plus. */
  "production_dossier_recipient.removed": fact(dossierRecipient()),
  /**
   * Le dossier du jour est parti (plan `dossier-prod-du-jour.md`, E3) : à la
   * clôture, ou complété après un retirage. Des comptes seulement — aucune
   * adresse ni aucun nom de destinataire : les échecs se nomment dans la
   * cloche, pas au journal. L'auteur est le système.
   */
  "production_day.dossier_sent": fact(
    payload({
      subjectLabel: subjectLabel(),
      serviceDay: day(),
      sent: count(),
      failed: count(),
      completed: z.boolean(),
    }),
  ),
} as const;

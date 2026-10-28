import { z } from "zod";

import { clockTime, count, day, fact, payload, retired, subjectLabel } from "./fact.js";

/**
 * **Les réglages du fournil** (plan `documentation/fournil/arret-du-plan.md`,
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

/** Un raccourci du fournil : son nom, son produit, ses pièces. */
const batchShortcutFields = () => ({
  subjectLabel: subjectLabel(),
  sku: z.string().min(1),
  label: z.string().min(1),
  pieces: count(),
});

const batchShortcut = () => payload(batchShortcutFields());

export const PRODUCTION_SETTINGS_FACTS = {
  /**
   * Le mode ou une heure a changé. `before` est le réglage en vigueur, défaut compris.
   * Retiré le 2026-10-21 : l'arrêt du plan suit l'heure limite générale, il
   * n'a plus de mode ni d'heure à lui (`limites-de-commande/plan-une-seule-heure.md`
   * §5). Les lignes écrites avant restent lisibles.
   */
  "production_settings.close_changed": retired(
    payload({ before: closeSettings(), after: closeSettings() }),
  ),
  /**
   * Où le contrôle qualité se rend (Réglages › Commandes, décision de Hugo,
   * 2026-10-26) : l'état posé et celui qu'il remplace, défauts compris. Un
   * réglage unique, sans `subjectLabel`.
   */
  "production_quality_settings.updated": fact(
    payload({
      lineChecks: z.boolean(),
      orderChecks: z.boolean(),
      previous: payload({ lineChecks: z.boolean(), orderChecks: z.boolean() }),
    }),
  ),
  /**
   * Les tranches de production (Réglages › Production, plan
   * `fournil/plan-tranches-de-production.md`, T1, 2026-10-28) : l'état posé
   * et celui qu'il remplace, défauts compris. Un réglage unique, sans
   * `subjectLabel`.
   */
  "production_tranche_settings.updated": fact(
    payload({
      mode: z.enum(["fixed", "computed"]),
      fixedTranches: z.array(clockTime()),
      previous: payload({
        mode: z.enum(["fixed", "computed"]),
        fixedTranches: z.array(clockTime()),
      }),
    }),
  ),
  /**
   * Un raccourci du fournil (plan `fournil/plan-raccourcis-du-fournil.md`,
   * S1, 2026-10-28) : pour un produit, un nom et un nombre de pièces. Nommé
   * « 1 plaque (VIE-001) » — le nom et le SKU produit.
   */
  "production_batch_shortcut.created": fact(batchShortcut()),
  /** Son nom ou ses pièces ont changé ; `previous` dit ce qu'ils étaient. */
  "production_batch_shortcut.updated": fact(
    payload({
      ...batchShortcutFields(),
      previous: payload({ label: z.string(), pieces: count() }),
    }),
  ),
  /** Il est retiré — la ligne s'archive, elle ne s'efface pas. */
  "production_batch_shortcut.removed": fact(batchShortcut()),
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

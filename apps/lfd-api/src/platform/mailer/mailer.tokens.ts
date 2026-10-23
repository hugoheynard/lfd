import type { Mailer } from "@lfd/mailer";

import type { B2bMails } from "./mail-templates.js";

/**
 * Le jeton d'injection et le type du mailer, **hors du module**.
 *
 * Ils vivraient naturellement dans `mailer.module.ts`, mais ce module déclare
 * un contrôleur qui, lui, doit injecter le mailer : le module importerait le
 * contrôleur qui importerait le module. Un cycle ESM ne casse pas toujours —
 * il casse au pire moment, quand le symbole vaut `undefined` à l'évaluation
 * d'un décorateur, et le message d'erreur ne désigne alors rien d'utile.
 *
 * Un fichier sans dépendance vers le module coupe le cycle à la racine.
 */

/** Jeton d'injection du mailer — les appelants injectent **ça**, jamais un adaptateur. */
export const MAILER = Symbol("MAILER");

/** Le type qu'un appelant écrit : le mailer, chargé de la carte de cette app. */
export type B2bMailer = Mailer<B2bMails>;

/**
 * Jeton du **transport** : le mailer de `@lfd/mailer` (à blanc ou Resend),
 * qui rend le gabarit et l'envoie — SOUS le texte effectif et le journal.
 *
 * Séparé de {@link MAILER} pour qu'un e2e puisse doubler l'envoi en gardant
 * tout ce qui le précède : le texte publié appliqué au rendu (plan
 * `plan-textes-des-e-mails.md`, E2) ne s'éprouve qu'à travers lui. Personne
 * d'autre ne l'injecte.
 */
export const MAIL_TRANSPORT = Symbol("MAIL_TRANSPORT");

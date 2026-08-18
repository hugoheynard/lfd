/**
 * **Pourquoi** l'accès a été coupé. Ce n'est pas une étiquette d'affichage :
 * c'est ce qui décide de la reprise.
 *
 * - `staff` — décision humaine (impayé, litige). Seul un humain la lève.
 * - `kbis_revoked` — conséquence du retrait de la vérification du KBIS. Elle se
 *   lève **d'elle-même** dès qu'un extrait est vérifié à nouveau : c'est la même
 *   règle lue à l'endroit, et faire cliquer deux fois pour défaire un automatisme
 *   ne serait qu'une occasion d'oublier le second clic.
 *
 * Sans cette distinction, certifier un KBIS rouvrirait le robinet d'un client en
 * recouvrement — une suspension est un mur, pas un compteur.
 *
 * Parité avec l'enum Postgres vérifiée à la compilation
 * (`infrastructure/company-enum-parity.ts`).
 */
export type SuspensionCause = "staff" | "kbis_revoked";

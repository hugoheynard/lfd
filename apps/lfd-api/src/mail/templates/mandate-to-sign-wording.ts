/**
 * Le schéma SEPA du mandat joint — recopié en littéraux, **pas importé** : le
 * mailer est une brique de `platform/`, qui ne connaît pas la comptabilité. Il
 * reçoit un `scheme`, il ne sait pas d'où il vient.
 *
 * Le texte qui change d'un schéma à l'autre a quitté ce fichier le 2026-10-23
 * pour le dictionnaire des e-mails (`copy/`, section `customer.mandate-to-sign`,
 * indexée par ce type : ajouter un schéma sans son texte ne compile pas).
 */
export type MandateMailScheme = "CORE" | "B2B";

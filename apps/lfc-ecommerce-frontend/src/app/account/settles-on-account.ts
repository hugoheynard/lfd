import type { CompanyView, DeferredTerm } from '@lfd/contracts';

/*
 * 🔴 **Des imports de TYPE seulement, et c'est la raison de ce fichier**
 * (2026-09-26). `client-company.service.ts` est chargé au démarrage ; il
 * importait ces deux fonctions depuis `account.model.ts`, qui tire une VALEUR du
 * baril `@lfd/contracts` — donc zod et tous les schémas dans le bundle initial.
 * Le déploiement de la boutique a échoué sur son budget cloudflare (1,59 Mo
 * pour 1,30 Mo). Ici, rien du baril n'est évalué.
 */

/** Le seul crédit que la plateforme sait accorder (`deferredTermSchema`, vérifié le 2026-09-14). */
export const MONTHLY: DeferredTerm = 'monthly';

/**
 * **Cette société règle-t-elle au compte ?** — le SEUL calcul du front
 * (plan `comptabilite/prelevement/blocage-du-prelevement.md`, §1).
 *
 * Le mensuel ACCORDÉ ne suffit plus : la comptabilité peut suspendre le
 * prélèvement sans retirer le crédit (`directDebitBlocked`). `grantedTerms`
 * reste alors rempli — le client doit comprendre qu'il a un crédit, suspendu —
 * et lire ce champ seul proposerait un règlement que le serveur refuse.
 */
export function settlesOnAccount(company: CompanyView | null): boolean {
  return company !== null && company.grantedTerms.includes(MONTHLY) && !company.directDebitBlocked;
}

/**
 * Le crédit est accordé, mais la comptabilité en a suspendu le prélèvement.
 * Jamais vrai pour un organisme public : il n'est pas prélevé, il n'y a pas de
 * prélèvement à suspendre.
 */
export function directDebitSuspended(company: CompanyView | null): boolean {
  return (
    company !== null &&
    !payerIsPublic(company) &&
    company.grantedTerms.includes(MONTHLY) &&
    company.directDebitBlocked
  );
}

/**
 * **Le payeur est-il un organisme public ?** Calculé au serveur sur le PAYEUR
 * (le principal suivi en facturation, sinon la société) : un public règle au
 * compte, par virement, et la carte ne lui est jamais proposée.
 */
export function payerIsPublic(company: CompanyView | null): boolean {
  return company?.payerIsPublic === true;
}

/**
 * **Le payeur est-il un de nos restaurants ?** Calculé au serveur sur le
 * PAYEUR : ses commandes sont internes, sans facturation — ni carte ni compte
 * ne lui sont proposés, le serveur refuse la carte par son nom.
 */
export function payerIsInHouse(company: CompanyView | null): boolean {
  return company?.payerIsInHouse === true;
}

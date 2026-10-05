import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Une forme de prélèvement n'a de sens que pour un site facturé au principal**
 * (`plan-sous-comptes.md` §2.1 ter). Une société qui paie seule se prélève sur
 * son propre mandat ; il n'y a rien à choisir.
 */
export class CollectionFormNeedsBillingFollowError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.collection_form.needs_billing_follow",
      "Ce compte n'est pas facturé à un compte principal : sa forme de prélèvement ne se choisit pas. Faites-lui suivre la facturation du principal d'abord.",
    );
  }
}

/** Deux décisions au même instant : la seconde fermerait la première sur elle-même. */
export class CollectionFormSameInstantError extends DomainError {
  constructor(readonly companyId: string) {
    super(
      "account.collection_form.same_instant",
      "Une forme de prélèvement vient d'être posée à cet instant précis : réessayez dans un instant.",
    );
  }
}

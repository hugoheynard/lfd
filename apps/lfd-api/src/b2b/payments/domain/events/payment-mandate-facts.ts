/**
 * Les **faits du mandat de prélèvement** — ce que le journal retient d'une
 * autorisation de débit.
 *
 * Tous partent par `publishTraced`, dans la transaction de l'écriture qu'ils
 * décrivent, **client comme staff** (plan `documentation/b2b/plan-mandat-client.md`
 * §7 #7 et §9 #3). La raison est celle d'`ACCOUNTING_FACTS` : chacun de ces
 * gestes finit opposé en contestation, et « qui a frappé cette RUM, qui a
 * déposé ce scan, qui l'a activé » doit avoir une réponse.
 *
 * Un fait par geste, et `via` dit qui l'a fait — plutôt qu'un type par canal :
 * le lecteur cherche « les frappes de cette société », pas « les frappes
 * client » d'un côté et « staff » de l'autre.
 *
 * ⚠️ Aucun payload ne porte d'IBAN, ni même `last4` : le journal se relit des
 * années après, et une coordonnée bancaire n'a rien à y faire.
 */
export const PAYMENT_MANDATE_FACTS = {
  /** Une RUM est frappée : un papier à signer existe. */
  minted: "payment_mandate.minted",
  /** Un scan signé est déposé sur le brouillon — ou remplace le précédent. */
  proofAttached: "payment_mandate.proof_attached",
  /** Le staff déclare le papier signé : le mandat autorise désormais un débit. */
  signed: "payment_mandate.signed",
  /** Le brouillon est révoqué parce que ce qu'il imprime a changé. */
  draftVoided: "payment_mandate.draft_voided",
  /**
   * Les zones 14 et 19 sont réécrites — **avec ou sans brouillon** (décidé le
   * 2026-09-14, plan §10). Sans ce fait, une référence changée sur les relevés
   * du client n'aurait ni auteur ni date.
   */
  optionsChanged: "payment_mandate.options_changed",
} as const;

/** Qui a fait le geste : un agent du back-office, ou le client depuis « Mon compte ». */
export type MandateActorChannel = "staff" | "customer";

/**
 * Ce qui a changé sur le papier et rendu le brouillon caduc.
 *
 * Les deux dernières viennent d'un réglage de l'**entité émettrice** (plan
 * `documentation/b2b/plan-mandat-deux-schemas.md` §10.4) : elles révoquent tous
 * ses brouillons d'un coup, et non celui d'une société.
 */
export type DraftVoidingCause =
  | "bank_account_changed"
  | "mandate_options_changed"
  | "mandate_scheme_changed"
  | "mandate_defaults_changed";

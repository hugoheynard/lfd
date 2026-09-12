/**
 * Les **faits de la comptabilité** — ce que le journal retient de notre propre
 * identité d'émetteur.
 *
 * Tous partent par `publishTraced`, sans exception, et la raison n'est pas la
 * même que pour les comptes clients. Là-bas, on trace parce qu'un agent agit sur
 * le dossier de quelqu'un d'autre. Ici, il n'y a pas de tiers : on trace parce
 * que **chacun de ces champs finit imprimé sur un document opposable**, ou
 * décide d'où l'argent arrive. Le jour où un mandat est contesté, la question
 * n'est pas « quelle est notre adresse » mais « quelle adresse portait le papier
 * qu'il a signé, et qui l'avait saisie ».
 *
 * `creditorAccountChanged` mérite une mention à part : changer l'IBAN qui reçoit
 * est le geste que la fraude au virement vise en premier. Une trace ne l'empêche
 * pas — elle rend le détournement **racontable**, ce qui est tout ce qu'un
 * journal peut promettre.
 *
 * ⚠️ Aucun de ces payloads ne porte l'IBAN. Le journal est lu par du personnel
 * qui n'a pas à connaître le compte, et une trace se relit des années après :
 * y déposer une coordonnée bancaire, c'est la répandre dans le temps.
 */
export const ACCOUNTING_FACTS = {
  /** Une entité émettrice est déclarée — sans ICS ni compte, c'est normal. */
  legalEntityDeclared: "legal_entity.declared",
  /** Raison sociale, forme, RCS, capital, TVA ou adresse corrigés. */
  legalEntityCorrected: "legal_entity.corrected",
  /** L'ICS est attribué. **Une seule fois dans la vie de l'entité.** */
  creditorIdentifierAssigned: "legal_entity.creditor_identifier_assigned",
  /** Le compte où l'argent arrive change. */
  creditorAccountChanged: "legal_entity.creditor_account_changed",
  /** Le délai annoncé entre pré-notification et débit est renégocié. */
  preNotificationChanged: "legal_entity.pre_notification_changed",
  /** L'entité n'émet plus rien ; ses documents passés restent. */
  legalEntityArchived: "legal_entity.archived",
  legalEntityRestored: "legal_entity.restored",
} as const;

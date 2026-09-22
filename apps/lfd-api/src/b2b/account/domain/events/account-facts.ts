import type { JournalFactType } from "@lfd/contracts/journal-facts";

/**
 * Les **faits des comptes clients** — ce que le journal retient d'une société.
 *
 * Ils vivent ici, chez l'émetteur, et non dans `growth/` où ils étaient nés :
 * `growth` OBSERVE les comptes, il ne les décide pas. Tant qu'il était le seul
 * à écrire, la distinction ne coûtait rien ; depuis que les handlers des comptes
 * inscrivent eux-mêmes leurs actes, laisser le vocabulaire chez l'observateur
 * ferait dépendre l'auteur de son témoin. `ACTIVITY_TYPES` les reprend pour ses
 * lectures — dans ce sens-là, la dépendance est juste.
 *
 * ## Deux natures, et elles ne se journalisent pas pareil
 *
 * **Les actes du staff** (`identity_corrected`, `payment_terms_granted`,
 * `kbis_certified`…) sont posés par un agent sur le compte de QUELQU'UN
 * D'AUTRE. Ils partent par `publishTraced` : la trace est dans la transaction,
 * une panne de journal annule l'acte. C'est le seul niveau qui rend la trace
 * opposable — sinon « qui a accordé ce délai de paiement » finit par n'avoir
 * aucune réponse le jour où on la pose.
 *
 * **Les gestes du client sur son propre compte** (adresses, contacts, identité,
 * profil) partent AUSSI par `publishTraced`, sous les mêmes noms, depuis le
 * 2026-09-19 (plan `documentation/journalisation/plan-journal-d-activite.md`
 * §3, décision 1) — sans coordonnées (`member-acts.event.ts`).
 *
 * **Les faits du parcours** (`declared`, `step_reached`) décrivent l'entonnoir
 * d'inscription. Ils restent best-effort, via leurs abonnés : les perdre
 * dégrade une statistique d'entonnoir, bloquer une inscription sur un hoquet
 * d'`INSERT` dégraderait le service.
 */
export const ACCOUNT_FACTS = {
  /** Le client s'est déclaré (`via` dit par qui : lui-même, ou le staff). */
  companyDeclared: "company.declared",
  /** Une pièce d'activation vient d'être fournie — entonnoir. */
  companyStepReached: "company.step_reached",
  companyActivated: "company.activated",
  /** Extrait KBIS **vérifié** par un agent — la porte d'activation s'ouvre. */
  kbisCertified: "company.kbis_certified",
  /** Vérification **retirée** — et accès coupé si le compte était actif. */
  kbisRevoked: "company.kbis_revoked",

  /**
   * L'extrait KBIS est déposé — par le client ou par un agent à sa place.
   *
   * S'écrivait `company.kbis_uploaded_by_staff` jusqu'au 2026-09-19 : le fait
   * nommait son auteur, alors que la ligne le porte déjà. Un geste, un nom,
   * auteur quelconque (lot 1 du plan du journal, tranche (c)). Les lignes
   * écrites avant gardent l'ancien nom — aucune migration : ni contrat ni écran
   * ne le lisait (vérifié le 2026-09-19).
   */
  kbisUploaded: "company.kbis_uploaded",
  /** Un agent corrige l'identité légale ou commerciale. */
  identityCorrected: "company.identity_corrected",
  /** Un agent accorde (ou retire) des délais de paiement. */
  paymentTermsGranted: "company.payment_terms_granted",
  /** Un agent suspend, réactive ou résilie le compte. */
  statusChanged: "company.status_changed",
  /** Un agent écrit l'adresse de facturation — celle qui part sur les factures. */
  billingAddressSaved: "company.billing_address_saved",
  deliveryAddressAdded: "company.delivery_address_added",
  deliveryAddressUpdated: "company.delivery_address_updated",
  deliveryAddressRemoved: "company.delivery_address_removed",
  /** Où l'on livre par défaut — donc où partira la prochaine commande. */
  defaultDeliverySet: "company.default_delivery_set",
  /**
   * La procédure de livraison d'une adresse a été modifiée — ajouté,
   * refait, supprimé ou réordonné une étape. Un livreur envoyé à la mauvaise
   * porte se remonte à qui a écrit la consigne. Préfixé `company.` comme les
   * autres : le journal range un fait dans son module PAR SON PRÉFIXE
   * (`growth/domain/activity-module.ts`), et un `delivery_procedure.` n'aurait
   * appartenu à aucun — invisible dans le filtre « comptes » (vérifié le
   * 2026-09-15).
   *
   * S'écrivait `company.delivery_procedure_edited_by_staff` jusqu'au
   * 2026-09-19, quand seul le staff était journalisé : le client écrit
   * désormais le même fait, l'auteur de la ligne les distingue. Les lignes
   * écrites avant gardent l'ancien nom — aucune migration : ni contrat ni écran
   * ne le lisait (vérifié le 2026-09-19).
   */
  deliveryProcedureEdited: "company.delivery_procedure_edited",
  /** Retrait ou livraison par défaut, réglé par un agent. */
  fulfillmentPreferenceSet: "company.fulfillment_preference_set",
  contactAdded: "company.contact_added",
  contactUpdated: "company.contact_updated",
  contactRemoved: "company.contact_removed",
  /** L'interlocuteur principal change — c'est lui qui reçoit les courriers. */
  primaryContactChanged: "company.primary_contact_changed",
  /**
   * Le client édite l'identité de sa société (enseigne, TVA) et COMPLÈTE
   * l'identité légale — distinct de `identity_corrected`, que seul le staff
   * pose parce qu'il réécrit un SIRET.
   */
  identityEdited: "company.identity_edited",
  /** Le client demande un délai de paiement (ou retire sa demande). */
  paymentTermRequested: "company.payment_term_requested",
  /** Un accès à l'espace de la société est ouvert à une personne. */
  accessOpened: "company.access_opened",

  /** La personne modifie son profil — les champs, pas leurs valeurs. */
  profileUpdated: "user.profile_updated",
  /** Un agent fabrique un lien de mot de passe à remettre — le geste, pas le lien. */
  passwordLinkIssued: "user.password_link_issued",
  /**
   * La personne demande elle-même à changer son mot de passe, depuis son profil.
   *
   * 🔴 **Pas `passwordLinkIssued` réutilisé** : sa phrase dit « à lui remettre
   * en personne », ce qui serait faux ici — personne ne remet rien, le lien
   * part à la boîte et l'acteur est le sujet lui-même.
   */
  passwordResetRequested: "user.password_reset_requested",
  /**
   * Une méthode de connexion de plus ouvre le compte (Google, demain Facebook).
   *
   * Préfixé `user.` et non `account.` comme l'écrivait le plan : le journal
   * range un fait dans son module PAR SON PRÉFIXE
   * (`growth/domain/activity-module.ts`), et `account.` n'appartiendrait à
   * aucun — invisible dans le filtre « comptes », exactement le piège décrit
   * plus haut pour `delivery_procedure.` (vérifié le 2026-09-22).
   */
  identityLinked: "user.identity_linked",
  /** Une méthode de connexion secondaire a été détachée. */
  identityRevoked: "user.identity_revoked",
} as const satisfies Readonly<Record<string, JournalFactType>>;

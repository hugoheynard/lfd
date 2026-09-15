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
 * **Les faits du parcours** (`declared`, `step_reached`) décrivent ce que le
 * client fait chez lui. Ils restent best-effort, via leurs abonnés : les perdre
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

  /** Un agent dépose l'extrait à la place du client. */
  kbisUploadedByStaff: "company.kbis_uploaded_by_staff",
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
   * Un agent a modifié la procédure de livraison d'une adresse — ajouté,
   * refait, supprimé ou réordonné une étape. Un livreur envoyé à la mauvaise
   * porte se remonte à qui a écrit la consigne. Préfixé `company.` comme les
   * autres : le journal range un fait dans son module PAR SON PRÉFIXE
   * (`growth/domain/activity-module.ts`), et un `delivery_procedure.` n'aurait
   * appartenu à aucun — invisible dans le filtre « comptes » (vérifié le
   * 2026-09-15).
   */
  deliveryProcedureEdited: "company.delivery_procedure_edited_by_staff",
  /** Retrait ou livraison par défaut, réglé par un agent. */
  fulfillmentPreferenceSet: "company.fulfillment_preference_set",
  contactAdded: "company.contact_added",
  contactUpdated: "company.contact_updated",
  contactRemoved: "company.contact_removed",
  /** L'interlocuteur principal change — c'est lui qui reçoit les courriers. */
  primaryContactChanged: "company.primary_contact_changed",
} as const;

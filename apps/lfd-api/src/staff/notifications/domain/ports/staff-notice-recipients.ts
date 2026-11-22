/**
 * **À qui part un avis** — la lecture que le staff PUBLIE pour le bloc `mail`
 * (lot P1c, `documentation/payment/liens-de-paiement/les-liens-de-paiement.md`),
 * sur le modèle de `StaffContacts` : le staff dit ce qui est à lui, `mail` le
 * prend. Un port étroit (ISP) : ni le réglage, ni l'écran.
 *
 * Pour un modèle d'e-mail : les membres des rôles réglés et les membres
 * nommés, **non suspendus et avec une adresse** (le filtre de
 * `ReachableStaff`), dédoublonnés, triés par identifiant. Un modèle sans
 * réglage, ou sans personne de joignable, rend une liste vide.
 */
export abstract class StaffNoticeRecipients {
  abstract recipientsOf(template: string): Promise<readonly StaffNoticeRecipient[]>;
}

/** Un destinataire : sa fiche et son adresse d'aujourd'hui. */
export interface StaffNoticeRecipient {
  readonly staffUserId: string;
  readonly email: string;
}

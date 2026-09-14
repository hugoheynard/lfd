import { assignableRoleSchema, COMPANY_ROLE_LABELS, type AssignableRole } from '@lfd/contracts';

/**
 * Les **libellés** du fragment `lfd-contact-fields` — tous ses textes, options
 * de rôle comprises.
 *
 * Le fragment les écrivait en français en dur. Le back-office ne parle que
 * français ; `/mon-compte` parle aussi anglais et italien, et ouvre le même
 * fragment. Une seule entrée typée, dont le défaut est EXACTEMENT le texte
 * d'avant : l'admin, qui ne passe rien, ne change pas d'un caractère.
 *
 * La validation d'un contact (`isCompanyContactValid`,
 * `isAdditionalContactValid`) rend un booléen et aucun message : il n'y a pas
 * de texte de règle à sortir ici (vérifié le 2026-09-14).
 */
export interface ContactFieldsLabels {
  readonly email: string;
  /** Sous l'e-mail : ce qui arriverait par cette adresse. */
  readonly emailHint: string;
  readonly role: string;
  readonly rolePlaceholder: string;
  /** Le nom de chaque rôle attribuable — le détenteur n'en fait pas partie, il est constaté. */
  readonly roles: Readonly<Record<AssignableRole, string>>;
  readonly firstName: string;
  readonly lastName: string;
  readonly fonction: string;
  readonly fonctionPlaceholder: string;
  readonly phone: string;
}

/**
 * Le texte d'avant l'entrée, mot pour mot. Les rôles viennent de
 * `COMPANY_ROLE_LABELS`, « la seule traduction des rôles » du contrat : c'est
 * d'elle que le fragment les tenait, et un rôle renommé là le reste ici.
 */
export const CONTACT_FIELDS_LABELS_FR: ContactFieldsLabels = {
  email: 'E-mail',
  emailHint: "c'est par là qu'un accès lui serait envoyé",
  role: 'Rôle dans la société',
  rolePlaceholder: 'À choisir',
  roles: {
    admin: COMPANY_ROLE_LABELS.admin,
    orders: COMPANY_ROLE_LABELS.orders,
    billing: COMPANY_ROLE_LABELS.billing,
  },
  firstName: 'Prénom',
  lastName: 'Nom',
  fonction: 'Fonction',
  fonctionPlaceholder: 'ex. Responsable achats',
  phone: 'Téléphone',
};

/** Les rôles proposés, dans l'ordre du contrat, nommés dans la langue de l'écran. */
export function roleOptionsOf(
  labels: ContactFieldsLabels,
): readonly { readonly value: AssignableRole; readonly label: string }[] {
  return assignableRoleSchema.options.map((value) => ({ value, label: labels.roles[value] }));
}

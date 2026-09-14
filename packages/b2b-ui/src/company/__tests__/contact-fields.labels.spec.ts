import { assignableRoleSchema, COMPANY_ROLE_LABELS } from '@lfd/contracts';

import {
  CONTACT_FIELDS_LABELS_FR,
  type ContactFieldsLabels,
  roleOptionsOf,
} from '../contact-fields/contact-fields.labels';

describe('libellés de ContactFields', () => {
  /** Le texte écrit en dur avant l'entrée : le back-office ne passe rien, et ne change pas. */
  it('le défaut reprend mot pour mot le gabarit d’avant', () => {
    expect(CONTACT_FIELDS_LABELS_FR).toEqual({
      email: 'E-mail',
      emailHint: "c'est par là qu'un accès lui serait envoyé",
      role: 'Rôle dans la société',
      rolePlaceholder: 'À choisir',
      roles: { admin: 'Administrateur', orders: 'Commandes', billing: 'Facturation' },
      firstName: 'Prénom',
      lastName: 'Nom',
      fonction: 'Fonction',
      fonctionPlaceholder: 'ex. Responsable achats',
      phone: 'Téléphone',
    });
  });

  it('les options de rôle par défaut sont celles d’avant : ordre du contrat, noms du contrat', () => {
    expect(roleOptionsOf(CONTACT_FIELDS_LABELS_FR)).toEqual(
      assignableRoleSchema.options.map((value) => ({ value, label: COMPANY_ROLE_LABELS[value] })),
    );
  });

  it('le détenteur n’est jamais proposé', () => {
    expect(roleOptionsOf(CONTACT_FIELDS_LABELS_FR).map((option) => option.value)).not.toContain(
      'owner',
    );
  });

  it('des libellés passés nomment les rôles, sans changer leurs valeurs', () => {
    const english: ContactFieldsLabels = {
      ...CONTACT_FIELDS_LABELS_FR,
      roles: { admin: 'Administrator', orders: 'Orders', billing: 'Billing' },
    };
    expect(roleOptionsOf(english)).toEqual([
      { value: 'admin', label: 'Administrator' },
      { value: 'orders', label: 'Orders' },
      { value: 'billing', label: 'Billing' },
    ]);
  });
});

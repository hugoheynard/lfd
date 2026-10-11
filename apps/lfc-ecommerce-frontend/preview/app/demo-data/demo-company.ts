import type {
  CompanyAddressesView,
  CompanyBankAccountSectionView,
  IssuedInvoicesView,
} from '@lfd/contracts';

/**
 * **Le dossier de la société de démonstration** — ce que l'espace pro lit
 * en plus de `GET /me` : son carnet d'adresses (une facturation, une
 * livraison par défaut), aucun RIB déposé, aucune facture émise. Des
 * adresses fictives, dans la zone de livraison de démonstration.
 */
export const DEMO_COMPANY_ADDRESSES: CompanyAddressesView = {
  billing: {
    id: 'demo-billing',
    label: 'Siège',
    ligne1: '1 rue de l’Exemple',
    ligne2: '',
    codePostal: '73000',
    ville: 'Chambéry',
    pays: 'France',
  },
  deliveries: [
    {
      id: 'demo-delivery',
      label: 'Le café',
      ligne1: '2 place de l’Aperçu',
      ligne2: '',
      codePostal: '73000',
      ville: 'Chambéry',
      pays: 'France',
      isDefault: true,
      specs: {
        note: '',
        deliveryContact: null,
        gps: null,
        signatureRequired: null,
        slotList: { mode: 'everyday', slots: [] },
      },
      procedureStepCount: 0,
      depositAllowed: false,
    },
  ],
};

export const DEMO_COMPANY_BANK_ACCOUNT: CompanyBankAccountSectionView = { account: null };

export const DEMO_COMPANY_INVOICES: IssuedInvoicesView = { invoices: [] };

import type { AccountView, CompanyView, MyLoyaltyView } from '@lfd/contracts';
import { PERSONAL_WORKSPACE } from '@lfd/contracts/workspace';

/**
 * **Les personnes de l'aperçu** — telles que `GET /me` les rend. Des noms
 * fictifs, une adresse qui ne reçoit rien (`.invalid` ne se résout jamais).
 */

const PROFILE = {
  userId: 'demo-user',
  firstName: 'Camille',
  lastName: 'Exemple',
  email: 'camille@apercu.invalid',
  phone: '06 00 00 00 00',
} as const;

/** Un particulier connecté, sans société. */
export const DEMO_PERSON: AccountView = {
  profile: PROFILE,
  companies: [],
  navPrefs: { catalogueView: null, workspace: PERSONAL_WORKSPACE },
};

export const DEMO_COMPANY_ID = 'demo-company';

/** Une société active, au compte (crédit mensuel accordé, prélèvement non suspendu). */
const DEMO_COMPANY: CompanyView = {
  id: DEMO_COMPANY_ID,
  reference: 'DEMO-0001',
  raisonSociale: 'Café Exemple SARL',
  enseigne: 'Café Exemple',
  formeJuridique: 'SARL',
  siret: '00000000000000',
  siren: '000000000',
  vatNumber: '',
  vatNumberRequired: false,
  status: 'active',
  grantedTerms: ['monthly'],
  requestedTerm: null,
  directDebitBlocked: false,
  role: 'owner',
  primaryContact: {
    id: null,
    firstName: PROFILE.firstName,
    lastName: PROFILE.lastName,
    fonction: 'Gérante',
    email: PROFILE.email,
    phone: PROFILE.phone,
    role: null,
  },
  contacts: [],
  kbis: null,
  fulfillmentPreference: {
    method: null,
    pickupAddressId: null,
    deliveryAddressId: null,
    signatureRequired: false,
  },
};

/** La même personne, travaillant dans l'espace de sa société. */
export const DEMO_PRO: AccountView = {
  profile: PROFILE,
  companies: [DEMO_COMPANY],
  navPrefs: { catalogueView: null, workspace: DEMO_COMPANY_ID },
};

/** Le programme de fidélité ouvert, un solde modeste, rien à convertir. */
export const DEMO_LOYALTY_OPEN: MyLoyaltyView = {
  open: true,
  balancePoints: 120,
  pointsPerStep: 500,
  stepValueCents: 500,
  convertibleSteps: 0,
  vouchers: [],
  entries: [],
};

export const DEMO_LOYALTY_CLOSED: MyLoyaltyView = { open: false };

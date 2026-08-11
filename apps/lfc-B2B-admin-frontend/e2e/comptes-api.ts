import type { Page, Route } from '@playwright/test';
import type { CompanyContactView, CustomerLookupView, PlatformSettings } from '@lfd/contracts';

/** La société sur laquelle portent les tests d'ouverture de compte. */
export const COMPANY_ID = 'company-cpt';

/** Ce qu'un appel d'ouverture d'accès a reçu — les tests s'y adossent. */
export interface InviteCall {
  readonly email: string;
  readonly role: string;
}

/** Ce qu'un ajout d'interlocuteur a reçu. */
export interface ContactCall {
  readonly email: string;
  readonly role: string;
  readonly firstName: string;
}

/**
 * L'API des **comptes clients**, doublée dans la page.
 *
 * Un double avec de la mémoire : ouvrir un accès change ce que la fiche rendra
 * ensuite. Sans ça, « j'ouvre l'accès puis l'écran se recharge » ne prouverait
 * rien — la fiche réafficherait l'état d'avant et le test passerait quand même.
 *
 * Les réglages du scénario (`accessOpens`, `mailSent`, `reachable`) sont là
 * parce que ce sont exactement les cas que le commercial rencontre et que
 * personne ne pense à tester : le fournisseur d'identité injoignable, l'e-mail
 * qui ne part pas, l'activation d'un compte qu'on ne peut pas appeler.
 */
export class ComptesApiDouble {
  /** Les clients déjà connus, que la recherche de détenteur remonte. */
  readonly customers: CustomerLookupView[] = [];
  /** L'ouverture d'accès réussit-elle à la création ? (Non = pas de M2M.) */
  accessOpens = true;
  /** L'e-mail part-il vraiment ? Un « non » doit être DIT, pas arrondi. */
  mailSent = true;
  /** D'autres clients correspondent-ils, au-delà de ce que la liste rend ? */
  truncated = false;

  readonly created: unknown[] = [];
  readonly invites: InviteCall[] = [];
  readonly addedContacts: ContactCall[] = [];
  /** Le nombre d'activations acceptées (204). */
  activations = 0;

  private contacts: CompanyContactView[] = [holder()];

  async install(page: Page): Promise<void> {
    await page.route('**/admin/**', (route) => this.dispatch(route));
    // Réglages et points de retrait vivent HORS de `/admin` : sans eux, la
    // fiche resterait en chargement.
    await page.route('**/platform-settings', (route) => json(route, SETTINGS));
    await page.route('**/pickup-addresses', (route) => json(route, []));
  }

  /** Le détenteur porte-t-il un numéro ? C'est la condition d'activation. */
  setHolderPhone(phone: string): void {
    this.contacts = this.contacts.map((contact) =>
      contact.contactId === null ? { ...contact, phone } : contact,
    );
  }

  private async dispatch(route: Route): Promise<void> {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();

    if (pathname.endsWith('/admin/customers')) {
      const term = new URL(route.request().url()).searchParams.get('q') ?? '';
      return json(route, { results: this.search(term), truncated: this.truncated });
    }
    if (pathname.endsWith('/admin/customers/by-email')) {
      return json(route, null);
    }
    if (pathname.endsWith('/admin/companies') && method === 'POST') {
      return this.open(route);
    }
    if (pathname.endsWith(`/admin/companies/${COMPANY_ID}/members`)) {
      return method === 'POST' ? this.invite(route) : json(route, []);
    }
    if (pathname.endsWith(`/admin/companies/${COMPANY_ID}/contacts`)) {
      return this.addContact(route);
    }
    if (pathname.endsWith(`/admin/companies/${COMPANY_ID}/activate`)) {
      return this.activate(route);
    }
    if (pathname.endsWith(`/admin/companies/${COMPANY_ID}`)) {
      return json(route, this.detail());
    }
    if (pathname.endsWith('/admin/notifications')) {
      return json(route, { unread: 0, notifications: [] });
    }
    // Le reste : une collection vide. Ces écrans en portent d'autres qui n'ont
    // rien à dire ici, et un 404 les mettrait en erreur pour rien.
    return json(route, pathname.endsWith('/pending') ? {} : []);
  }

  private search(term: string): readonly CustomerLookupView[] {
    const needle = term.trim().toLowerCase();
    if (needle.length < 2) {
      return [];
    }
    return this.customers.filter((customer) =>
      `${customer.firstName} ${customer.lastName} ${customer.email}`.toLowerCase().includes(needle),
    );
  }

  private async open(route: Route): Promise<void> {
    const body = route.request().postDataJSON() as { primaryContact: { email: string } };
    this.created.push(body);
    const email = body.primaryContact.email;
    const known = this.customers.some((customer) => customer.email === email);
    this.contacts = [{ ...holder(), email }];
    if (this.accessOpens) {
      this.contacts = [{ ...this.contacts[0]!, access: known ? 'active' : 'invited' }];
    }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: COMPANY_ID,
        accessOpened: this.accessOpens,
        attachedToExisting: known,
        mailSent: this.accessOpens && this.mailSent,
      }),
    });
  }

  private async invite(route: Route): Promise<void> {
    const payload = route.request().postDataJSON() as { email: string; role: string };
    this.invites.push({ email: payload.email, role: payload.role });
    // Idempotent sur l'adresse : ré-inviter ne crée pas de doublon, ça renvoie
    // un lien. L'état ne recule donc jamais.
    this.contacts = this.contacts.map((contact) =>
      contact.email === payload.email && contact.access === 'none'
        ? { ...contact, access: 'invited' }
        : contact,
    );
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        outcome: 'identity_created',
        member: {
          userId: 'user-1',
          email: payload.email,
          firstName: '',
          lastName: '',
          phone: '',
          role: payload.role,
          status: 'invited',
          joinedAt: '2026-08-11T09:00:00.000Z',
        },
        mailSent: this.mailSent,
      }),
    });
  }

  private async addContact(route: Route): Promise<void> {
    const payload = route.request().postDataJSON() as {
      email: string;
      role: string;
      firstName: string;
    };
    this.addedContacts.push(payload);
    this.contacts = [
      ...this.contacts,
      {
        contactId: `ct_${this.contacts.length}`,
        firstName: payload.firstName,
        lastName: '',
        fonction: '',
        email: payload.email,
        phone: '',
        role: payload.role as CompanyContactView['role'],
        access: 'none',
        emailVerified: false,
      },
    ];
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'ct_new' }),
    });
  }

  /**
   * Le gate d'activation est **serveur** : sans interlocuteur joignable, il
   * refuse. L'écran doit dire la même chose que lui, jamais mieux.
   */
  private async activate(route: Route): Promise<void> {
    const reachable = this.contacts.some((contact) => contact.phone.trim() !== '');
    if (!reachable) {
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'company.activation_blocked',
          message: 'Aucun numéro de téléphone : le compte ne peut pas être activé.',
        }),
      });
    }
    this.activations += 1;
    await route.fulfill({ status: 204, body: '' });
  }

  private detail(): unknown {
    return {
      id: COMPANY_ID,
      reference: 'C-CPT01',
      // Papiers réunis : ce que la fiche éprouve ici, c'est le TÉLÉPHONE.
      // L'ouverture sans papiers est un autre scénario, joué à la création.
      raisonSociale: 'Le Comptoir SAS',
      enseigne: 'Le Comptoir',
      formeJuridique: 'SAS',
      siret: '81245678900021',
      tvaIntracom: '',
      status: 'pending',
      paymentTerm: 'per_order',
      requestedPaymentTerm: null,
      primaryContact: {
        id: null,
        role: null,
        firstName: this.contacts[0]?.firstName ?? '',
        lastName: this.contacts[0]?.lastName ?? '',
        fonction: '',
        email: this.contacts[0]?.email ?? '',
        phone: this.contacts[0]?.phone ?? '',
      },
      kbis: null,
      owner: null,
      hasOpenSupportRequest: false,
      createdAt: '2026-08-11T09:00:00.000Z',
      vatNumberRequired: false,
      addresses: { billing: null, deliveries: [] },
      contacts: this.contacts,
    };
  }
}

/** Le détenteur d'un compte tout juste ouvert : connu, sans accès. */
function holder(): CompanyContactView {
  return {
    contactId: null,
    firstName: 'Jean',
    lastName: 'Dupont',
    fonction: '',
    email: 'jean@comptoir.fr',
    phone: '',
    role: 'owner',
    access: 'none',
    emailVerified: false,
  };
}

/** Un client déjà connu, pour le cas « il a déjà une entité commerciale ». */
export function knownCustomer(email: string): CustomerLookupView {
  return {
    userId: 'user-known',
    email,
    firstName: 'Claire',
    lastName: 'Vasseur',
    phone: '06 11 22 33 44',
    status: 'active',
    companies: [{ id: 'c-autre', raisonSociale: 'Vasseur Traiteur SARL' }],
  };
}

/** Toutes les pièces facultatives : le scénario porte sur l'accès, pas sur elles. */
const SETTINGS: PlatformSettings = {
  tva: 'optional',
  kbis: 'optional',
  billing: 'optional',
  delivery: 'optional',
};

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

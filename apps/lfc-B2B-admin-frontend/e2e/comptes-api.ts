import type { Page, Route } from '@playwright/test';
import type { CompanyContactView, PlatformSettings } from '@lfd/contracts';

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
  /** Les adresses déjà connues de la plateforme — invisibles depuis l'écran. */
  readonly knownEmails: string[] = [];
  /** L'ouverture d'accès réussit-elle à la création ? (Non = pas de M2M.) */
  accessOpens = true;
  /** L'e-mail part-il vraiment ? Un « non » doit être DIT, pas arrondi. */
  mailSent = true;

  readonly created: unknown[] = [];
  readonly invites: InviteCall[] = [];
  readonly addedContacts: ContactCall[] = [];
  /** Le nombre d'activations acceptées (204). */
  activations = 0;
  /** La société a-t-elle un mandat de prélèvement actif ? */
  activeMandate = false;
  /** Les crédits de règlement accordés — pilote la zone de danger. */
  grantedTerms: string[] = [];

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

    if (pathname.endsWith('/admin/companies') && method === 'POST') {
      return this.open(route);
    }
    if (pathname.endsWith(`/admin/companies/${COMPANY_ID}/members`)) {
      return method === 'POST' ? this.invite(route) : json(route, []);
    }
    if (pathname.endsWith(`/admin/companies/${COMPANY_ID}/contacts`)) {
      return this.addContact(route);
    }
    if (pathname.endsWith(`/admin/companies/${COMPANY_ID}/mandate`)) {
      return this.mandate(route, method);
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

  /**
   * Le mandat de prélèvement. La clé Stripe est celle d'un compte de test qui
   * n'existe pas : ces tests n'ouvrent jamais l'iframe, ils vérifient ce que
   * l'écran dit et ce qu'il exige avant d'agir.
   */
  private async mandate(route: Route, method: string): Promise<void> {
    if (method === 'DELETE') {
      this.activeMandate = false;
      return route.fulfill({ status: 204, body: '' });
    }
    return json(route, {
      mandate: this.activeMandate
        ? {
            id: 'mdt_1',
            reference: 'RUM-E2E',
            status: 'active',
            last4: '3000',
            bankCode: 'BNPA',
            country: 'FR',
            acceptedAt: '2024-03-12T00:00:00.000Z',
            revokedAt: null,
            hasProof: false,
            proofFileName: '',
          }
        : null,
      publishableKey: 'pk_test_e2e',
    });
  }

  private async open(route: Route): Promise<void> {
    const body = route.request().postDataJSON() as { primaryContact: { email: string } };
    this.created.push(body);
    const email = body.primaryContact.email;
    const known = this.knownEmails.includes(email);
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
      // Vide par défaut : la société paie à la commande, comme tout le monde.
      grantedTerms: this.grantedTerms,
      requestedTerm: null,
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

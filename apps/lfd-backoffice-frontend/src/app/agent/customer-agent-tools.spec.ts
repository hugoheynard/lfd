import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CUSTOMER_AGENT_TOOLS, declareCustomerAgentTools } from './customer-agent-tools';

type ToolArgs = Record<string, string | number | boolean>;

interface RegisteredTool {
  readonly name: string;
  readonly execute: (args: ToolArgs) => Promise<string>;
}

/**
 * Des valeurs qu'aucun texte ne doit rendre : un `sub` Auth0, un nom de pièce,
 * un BIC, l'adresse d'un titulaire. Placées dans les réponses du serveur pour
 * prouver que les formateurs les écartent, pas seulement qu'elles manquent.
 */
const SECRETS = [
  'auth0|sub-secret',
  'kbis-secret.pdf',
  'preuve-secret.pdf',
  'BICSECRET',
  '12 rue du titulaire',
  'pk_secret',
] as const;

const COMPANY = {
  id: 'c1',
  reference: 'C-0001',
  raisonSociale: 'Chalets du Lac SAS',
  enseigne: 'Chalets du Lac',
  formeJuridique: 'SAS',
  siret: '12345678900011',
  siren: '123456789',
  vatNumber: 'FR00123456789',
  status: 'pending',
  grantedTerms: [],
  requestedTerm: 'net_30',
  directDebitBlocked: false,
  primaryContact: {
    id: null,
    firstName: 'Ana',
    lastName: 'Lac',
    fonction: '',
    email: 'ana@lac.fr',
    phone: '',
  },
  owner: null,
  kbis: { fileName: 'kbis-secret.pdf', uploadedAt: '2026-10-01T08:00:00.000Z', certifiedAt: null },
  hasOpenSupportRequest: false,
  createdAt: '2026-10-01T08:00:00.000Z',
  activatedAt: null,
  warnings: [{ kind: 'kbis_a_verifier', since: '2026-10-01T08:00:00.000Z' }],
  parent: null,
};

const DETAIL = {
  ...COMPANY,
  activation: null,
  suspensionCause: null,
  hasBankAccount: true,
  gate: { canActivate: false, blocking: ['telephone'], checklist: [] },
  hierarchy: {
    parent: null,
    subAccounts: [
      {
        id: 's1',
        enseigne: 'Chalet 1',
        city: 'Annecy',
        status: 'active',
        followedAspects: ['billing'],
      },
    ],
    follows: [],
    groupWithoutDelivery: false,
    collectionForm: null,
  },
};

const REQUEST = {
  id: 'r1',
  kind: 'contact',
  reasonId: 'x',
  reasonLabel: 'Ouvrir un compte',
  priority: 'high',
  audience: 'pro',
  authorName: 'Ana Lac',
  authorEmail: 'ana@lac.fr',
  authorPhone: '',
  message: 'Bonjour',
  userId: 'auth0|sub-secret',
  companyId: 'c1',
  receivedAt: '2026-10-10T08:00:00.000Z',
  handledAt: null,
  handledBy: null,
  anonymizedAt: null,
  details: {},
};

/** Ce que sert le serveur, route par route — l'ordre compte : du plus précis au plus large. */
const ROUTES: readonly (readonly [RegExp, object | null])[] = [
  [
    /\/admin\/companies\/c1\/members$/,
    [
      {
        userId: 'auth0|sub-secret',
        email: 'ana@lac.fr',
        firstName: 'Ana',
        lastName: 'Lac',
        phone: '',
        role: 'owner',
        status: 'active',
        joinedAt: '2026-10-01T08:00:00.000Z',
      },
    ],
  ],
  [
    /\/admin\/companies\/c1\/customer-sheet$/,
    {
      timeline: [
        {
          id: 't1',
          type: 'company.declared',
          occurredAt: '2026-10-01T08:00:00.000Z',
          actorType: 'customer',
          actorName: '',
          outcome: null,
        },
        {
          id: 't2',
          type: 'kbis.uploaded',
          occurredAt: '2026-10-02T08:00:00.000Z',
          actorType: 'staff',
          actorName: 'Hugo',
          outcome: null,
        },
      ],
    },
  ],
  [
    /\/admin\/companies\/c1\/mandate$/,
    {
      mandate: {
        id: 'm1',
        reference: 'RUM-1',
        status: 'active',
        scheme: 'core',
        last4: '4321',
        bankCode: 'X',
        country: 'FR',
        acceptedAt: '2026-10-03T08:00:00.000Z',
        revokedAt: null,
        hasProof: true,
        proofFileName: 'preuve-secret.pdf',
        proofRevision: '1',
      },
      publishableKey: 'pk_secret',
      mintBlockers: [],
      issuerScheme: 'core',
    },
  ],
  [
    /\/admin\/companies\/c1\/bank-account$/,
    {
      account: {
        holder: 'Chalets',
        holderLegalForm: 'SAS',
        addressLine1: '12 rue du titulaire',
        addressLine2: '',
        postalCode: '74000',
        city: 'Annecy',
        countryCode: 'FR',
        bic: 'BICSECRET',
        last4: '4321',
        debtorReference: '',
        contractNumber: '',
      },
    },
  ],
  [
    /\/admin\/companies\/c1\/invoices$/,
    {
      invoices: [
        {
          invoiceId: 'i1',
          number: 'F-1',
          kind: 'invoice',
          correctedInvoiceNumber: null,
          issuedOn: '2026-10-05',
          dueOn: '2026-11-05',
          period: null,
          periodClosesAt: null,
          periodLabel: 'Octobre',
          totalHtCents: 1000,
          totalVatCents: 55,
          totalTtcCents: 1055,
          documentAvailable: true,
        },
      ],
    },
  ],
  [/\/admin\/companies\/missing$/, null],
  [/\/admin\/companies\/c1$/, DETAIL],
  [
    /\/admin\/companies$/,
    [
      COMPANY,
      {
        ...COMPANY,
        id: 'c2',
        enseigne: 'Boulangerie Nord',
        raisonSociale: 'Nord SARL',
        siret: '99999999900011',
        status: 'active',
        kbis: null,
      },
    ],
  ],
  [
    /\/admin\/orders\?/,
    [
      {
        id: 'o1',
        orderNumber: 'CMD-1',
        placedAt: '2026-10-06T08:00:00.000Z',
        status: 'confirmed',
        paymentStatus: 'paid',
        fulfillmentMethod: 'delivery',
        subtotalCents: 1000,
        vatCents: 55,
        totalCents: 1055,
        customerLabel: 'x',
        companyId: 'c1',
        companyDisplayName: 'Chalets du Lac',
        origin: 'shop',
      },
    ],
  ],
  [
    /\/legal-entities\/e1\/payers\/c1\/billing-mode$/,
    {
      legalEntityId: 'e1',
      payerCompanyId: 'c1',
      mode: 'monthly',
      since: null,
      scheduled: null,
      changeLockedUntil: null,
      upcomingClosures: [],
    },
  ],
  [/\/legal-entities$/, [{ id: 'e1', name: 'LFD SAS' }]],
  [
    /\/statements\/cycles/,
    {
      cycles: [
        {
          periodClosesAt: '2026-11-01T00:00:00.000Z',
          periodStartsAt: '2026-10-01',
          periodLabel: 'Octobre 2026',
          inProgress: true,
        },
      ],
    },
  ],
  [
    /\/statements\/companies\/c1/,
    {
      companyId: 'c1',
      companyName: 'Chalets',
      provisional: true,
      scope: 'principal',
      cycle: {
        periodClosesAt: '2026-11-01T00:00:00.000Z',
        periodStartsAt: '2026-10-01',
        periodLabel: 'Octobre 2026',
        inProgress: true,
      },
      groups: [],
      selfPayingEntities: [],
      totals: {
        orderCount: 1,
        subtotalCents: 1000,
        discountCents: 0,
        voucherDiscountCents: 0,
        htCents: 1000,
        deliveryFeeCents: 0,
        lateFeeCents: 0,
        vatByRate: [],
        unventilatedVatCents: 0,
        vatCents: 55,
        totalCents: 1055,
      },
    },
  ],
  [/\/admin\/staff-access-pending$/, []],
  [
    /\/admin\/access-pending$/,
    [
      {
        userId: 'auth0|sub-secret',
        email: 'bob@lac.fr',
        firstName: 'Bob',
        lastName: 'Lac',
        companyId: 'c1',
        companyName: 'Chalets du Lac',
        invitedAt: '2026-10-08T08:00:00.000Z',
      },
    ],
  ],
  [/\/admin\/customer-requests\?status=pending/, [REQUEST]],
  [/\/admin\/customer-requests\?status=handled/, []],
];

function armTools() {
  const registered = new Map<string, RegisteredTool>();
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    writable: true,
    value: {
      registerTool: (tool: RegisteredTool): Promise<void> => {
        registered.set(tool.name, tool);
        return Promise.resolve();
      },
    },
  });
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const names = runInInjectionContext(TestBed.inject(Injector), () => declareCustomerAgentTools());
  const http = TestBed.inject(HttpTestingController);
  const methods: string[] = [];
  const urls: string[] = [];

  /** Appelle l'outil et sert chaque requête qu'il émet, jusqu'à ce qu'il rende. */
  async function call(name: string, args: ToolArgs = {}): Promise<string> {
    const tool = registered.get(name);
    if (tool === undefined) {
      throw new Error(`L'outil ${name} n'a pas été enregistré.`);
    }
    let settled = false;
    const result = tool.execute(args).finally(() => {
      settled = true;
    });
    for (let round = 0; round < 50 && !settled; round++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      for (const request of http.match(() => true)) {
        methods.push(request.request.method);
        urls.push(request.request.urlWithParams);
        const route = ROUTES.find(([pattern]) => pattern.test(request.request.urlWithParams));
        if (route === undefined || route[1] === null) {
          request.flush({ message: 'Introuvable.' }, { status: 404, statusText: 'Not Found' });
        } else {
          request.flush(route[1]);
        }
      }
    }
    return result;
  }
  return { names, call, methods, urls };
}

beforeEach(() => Reflect.deleteProperty(document, 'modelContext'));
afterEach(() => Reflect.deleteProperty(document, 'modelContext'));

describe('declareCustomerAgentTools', () => {
  it('ne déclare que des lectures : aucun nom de geste, et chaque outil enregistré', () => {
    const { names } = armTools();
    expect(names).toEqual(CUSTOMER_AGENT_TOOLS);
    for (const forbidden of [
      'create',
      'update',
      'activate',
      'suspend',
      'attach',
      'certify',
      'mint',
      'handle',
      'delete',
    ]) {
      expect(names.some((name) => name.includes(forbidden))).toBe(false);
    }
  });

  it("n'émet QUE des GET, sur tous les outils — aucun post, put, patch ni delete", async () => {
    const { call, methods } = armTools();
    const texts: string[] = [];
    for (const name of CUSTOMER_AGENT_TOOLS) {
      texts.push(await call(name, { companyId: 'c1', query: 'lac' }));
    }
    texts.push(await call('signup_read', { requestId: 'r1' }));

    expect(methods.length).toBeGreaterThan(CUSTOMER_AGENT_TOOLS.length);
    expect(new Set(methods)).toEqual(new Set(['GET']));
    for (const text of texts) {
      expect(text).not.toContain('REFUSÉ');
      for (const secret of SECRETS) {
        expect(text).not.toContain(secret);
      }
    }
  });

  it('accounts_search filtre par nom ou SIRET et dit le statut', async () => {
    const { call } = armTools();
    const byName = await call('accounts_search', { query: 'nord' });
    expect(byName).toContain('1 société(s) sur 2');
    expect(byName).toContain('Boulangerie Nord');
    expect(byName).toContain('Actif');
    expect(await call('accounts_search', { query: '1234 5678 900011' })).toContain(
      'Chalets du Lac',
    );
  });

  it("account_read dit ce qui bloque l'activation et l'état du KBIS, pas son fichier", async () => {
    const { call } = armTools();
    const text = await call('account_read', { companyId: 'c1' });
    expect(text).toContain("ce qui bloque l'activation : telephone");
    expect(text).toContain('À VÉRIFIER');
    expect(text).toContain('demandé : net_30');
  });

  it('account_read rend une société inconnue en clair, sans jeter', async () => {
    const { call } = armTools();
    expect(await call('account_read', { companyId: 'missing' })).toBe(
      "Aucune société d'id missing.",
    );
  });

  it('account_hierarchy liste les sites et ce que chacun suit', async () => {
    const { call } = armTools();
    const text = await call('account_hierarchy', { companyId: 'c1' });
    expect(text).toContain('compte PRINCIPAL');
    expect(text).toContain('Chalet 1 (Annecy)');
  });

  it('account_mandate rend le last4 et la preuve, jamais le BIC ni le fichier', async () => {
    const { call } = armTools();
    const text = await call('account_mandate', { companyId: 'c1' });
    expect(text).toContain('se termine par 4321');
    expect(text).toContain('preuve signée déposée');
  });

  it('account_orders lit les sous-comptes compris, bornés', async () => {
    const { call, urls } = armTools();
    expect(await call('account_orders', { companyId: 'c1' })).toContain('CMD-1');
    expect(urls.find((url) => url.includes('/admin/orders'))).toContain('withSubAccounts=true');
  });

  it('account_billing lit le relevé de la période en cours', async () => {
    const { call } = armTools();
    const text = await call('account_billing', { companyId: 'c1' });
    expect(text).toContain('Chez LFD SAS : Mensuel, par défaut');
    expect(text).toContain('Relevé Octobre 2026 — PROVISOIRE');
  });

  it('account_journal met le plus récent en tête', async () => {
    const { call } = armTools();
    const text = await call('account_journal', { companyId: 'c1' });
    expect(text.indexOf('kbis.uploaded')).toBeLessThan(text.indexOf('company.declared'));
  });

  it('signups_pending réunit sociétés en attente, accès et demandes', async () => {
    const { call } = armTools();
    const text = await call('signups_pending');
    expect(text).toContain('1 société(s) en attente de validation');
    expect(text).toContain('KBIS déposé, à vérifier');
    expect(text).toContain('Bob Lac (bob@lac.fr) — client de Chalets du Lac');
    expect(text).toContain('Ouvrir un compte');
  });

  it('signup_read rend une demande par son id', async () => {
    const { call } = armTools();
    const text = await call('signup_read', { requestId: 'r1' });
    expect(text).toContain('Message : Bonjour');
    expect(text).toContain('Non traitée.');
  });
});

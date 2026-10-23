import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  AccountBankExportsView,
  AccountBankRowView,
  AccountBankStandingView,
  LegalEntityView,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountBankExportsService } from '../../../account-bank-exports.service';
import { AccountBankExportCard } from './account-bank-export-card';

/**
 * Ce que la carte tient : le tableau de chaque compte débité (IBAN masqué,
 * BIC, état — écartés compris) avec les deux gestes « importé dans CENET » et
 * « signalé par la banque » sur les seuls comptes à exporter, « Préparer » inactif sans rien à exporter,
 * préparer puis télécharger, « J'ai déposé le fichier dans CENET » et « Abandonner » sur le seul
 * export en attente, et le refus du serveur lu même en `Blob`.
 */

const ENTITY = { id: 'le1', siren: '552100554', ics: 'FR72ZZZ123456' } as const;

function entity(over: Partial<Pick<LegalEntityView, 'ics'>> = {}): LegalEntityView {
  // Seuls ces trois champs sont lus par la carte ; le reste suit la forme.
  return { ...BASE_ENTITY, ...ENTITY, ...over };
}

const BASE_ENTITY: LegalEntityView = {
  id: 'le1',
  name: 'La Folie Douce',
  legalForm: 'SAS',
  siren: '552100554',
  vatNumber: '',
  rcs: '',
  shareCapitalCents: 0,
  addressLine1: '',
  addressLine2: '',
  postalCode: '',
  city: '',
  countryCode: 'FR',
  ics: '',
  creditorBic: '',
  creditorAccountHolder: '',
  creditorAccountLine1: '',
  creditorAccountLine2: '',
  creditorAccountPostalCode: '',
  creditorAccountCity: '',
  creditorAccountCountryCode: '',
  creditorAccountLast4: '',
  creditorIdentityFrozen: false,
  preNotificationDays: 14,
  autoCollectionEnabled: false,
  autoCollectionDelayHours: 1,
  billingModes: [],
  lastClosure: '2026-09-30T22:00:00.000Z',
  lastClosurePeriod: {
    closesAt: '2026-09-30T22:00:00.000Z',
    startsAt: '2026-08-31T22:00:00.000Z',
    label: 'du 1er au 30 septembre 2026',
  },
  collectionDaysAfterClosure: null,
  depositCutoff: null,
  nextCollection: {
    closesAt: '2026-10-31T23:00:00.000Z',
    plannedConstitutionAt: '2026-11-01T00:00:00.000Z',
    collectionDay: '2026-11-16',
    depositDeadline: null,
    tightDepositMargin: null,
  },
  mandateContractDescription: '',
  mandatePaymentType: 'recurrent',
  mandateScheme: 'B2B',
  archivedAt: null,
  canCollect: true,
  hasLogo: false,
  lastAutopilotRun: null,
  isLastActive: true,
  missingToCollect: [],
  invoicePaymentTerms: {
    latePenaltyRateBasisPoints: null,
    recoveryIndemnityCents: null,
    earlyPaymentDiscount: null,
  },
  missingToInvoice: [],
  invoicePrefix: 'LFD',
  invoicePrefixFrozen: false,
};

// Les dates ne sont comparées qu'au texte qu'elles produisent, jamais à l'horloge.
function row(
  bankAccountId: string,
  companyName: string,
  standing: AccountBankStandingView,
): AccountBankRowView {
  return {
    bankAccountId,
    companyName,
    tradeName: null,
    holder: `Titulaire ${companyName}`,
    ibanCountry: 'FR',
    ibanLast4: '0143',
    bic: 'BNPAFRPPXXX',
    standing,
  };
}

const VIEW: AccountBankExportsView = {
  debitedCount: 3,
  toExport: [{ bankAccountId: 'rib_a', companyName: 'Café A', ibanLast4: '0143' }],
  inFlightCount: 1,
  knownCount: 1,
  maxPerExport: 200,
  excluded: [
    { bankAccountId: 'rib_x', companyName: 'Sans Bic', ibanLast4: '2606', reason: 'no_bic' },
  ],
  accounts: [
    row('rib_a', 'Café A', { kind: 'to_export' }),
    row('rib_b', 'Bistrot B', { kind: 'in_flight', downloaded: false }),
    row('rib_c', 'Comptoir C', {
      kind: 'declared',
      reason: 'entered_in_cenet',
      at: '2026-10-05T09:00:00.000Z',
    }),
    row('rib_d', 'Dépôt D', {
      kind: 'declared',
      reason: 'reported_by_bank',
      at: '2026-10-06T09:00:00.000Z',
    }),
    row('rib_e', 'Épicerie E', { kind: 'imported', at: '2026-10-02T09:00:00.000Z' }),
    { ...row('rib_x', 'Sans Bic', { kind: 'excluded', reason: 'no_bic' }), bic: null },
  ],
  exports: [
    {
      id: 'exp_new',
      createdAt: '2026-10-09T09:00:00.000Z',
      accountCount: 1,
      lastDownloadedAt: null,
      importedAt: null,
      abandonedAt: null,
    },
    {
      id: 'exp_old',
      createdAt: '2026-10-01T09:00:00.000Z',
      accountCount: 1,
      lastDownloadedAt: '2026-10-01T10:00:00.000Z',
      importedAt: '2026-10-02T09:00:00.000Z',
      abandonedAt: null,
    },
    {
      id: 'exp_ko',
      createdAt: '2026-09-01T09:00:00.000Z',
      accountCount: 1,
      lastDownloadedAt: null,
      importedAt: null,
      abandonedAt: '2026-09-02T09:00:00.000Z',
    },
  ],
};

class FakeService {
  view: AccountBankExportsView = VIEW;
  readonly calls: string[] = [];
  fileError: unknown = null;
  of(): Promise<AccountBankExportsView> {
    this.calls.push('of');
    return Promise.resolve(this.view);
  }
  prepare(entityId: string): Promise<string> {
    this.calls.push(`prepare:${entityId}`);
    return Promise.resolve('exp_created');
  }
  file(entityId: string, exportId: string): Promise<Blob> {
    this.calls.push(`file:${entityId}:${exportId}`);
    // Comme le serveur : le téléchargement se garde sur l'export.
    this.view = {
      ...this.view,
      exports: this.view.exports.map((item) =>
        item.id === exportId ? { ...item, lastDownloadedAt: '2026-10-09T10:00:00.000Z' } : item,
      ),
      accounts: this.view.accounts.map((line) =>
        line.standing.kind === 'in_flight'
          ? { ...line, standing: { kind: 'in_flight', downloaded: true } }
          : line,
      ),
    };
    return this.fileError === null
      ? Promise.resolve(new Blob(['I;x'], { type: 'text/csv' }))
      : Promise.reject(this.fileError);
  }
  markImported(entityId: string, exportId: string): Promise<void> {
    this.calls.push(`imported:${entityId}:${exportId}`);
    return Promise.resolve();
  }
  abandon(entityId: string, exportId: string): Promise<void> {
    this.calls.push(`abandon:${entityId}:${exportId}`);
    return Promise.resolve();
  }
  declareKnown(entityId: string, bankAccountId: string, reason: string): Promise<void> {
    this.calls.push(`known:${entityId}:${bankAccountId}:${reason}`);
    return Promise.resolve();
  }
}

let service: FakeService;

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AccountBankExportCard],
    providers: [{ provide: AccountBankExportsService, useValue: service }],
  });
  const fixture = TestBed.createComponent(AccountBankExportCard);
  fixture.componentRef.setInput('entity', entity());
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<AccountBankExportCard>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

function buttons(fixture: ComponentFixture<AccountBankExportCard>, label: string) {
  return [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
  ].filter((node) => (node.textContent ?? '').trim() === label);
}

beforeEach(() => {
  service = new FakeService();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

const CENET = "J'ai déposé le fichier dans CENET";

function figure(fixture: ComponentFixture<AccountBankExportCard>, filter: string) {
  const node = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    `[data-figure="${filter}"]`,
  );
  if (node === null) throw new TypeError(`chiffre ${filter} absent`);
  return node;
}

function companyCells(fixture: ComponentFixture<AccountBankExportCard>): string[] {
  // Une ligne de la cellule par élément, jointes par « | ».
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll('.ab-company')].map((node) =>
    [...node.children]
      .map((line) => (line.textContent ?? '').replace(/\s+/g, ' ').trim())
      .join(' | '),
  );
}

describe('la colonne « Société »', () => {
  it('enseigne en gras, raison sociale dessous, titulaire identique tu', async () => {
    service.view = {
      ...VIEW,
      accounts: [
        {
          ...row('rib_a', 'SAS Les Tommeuses', { kind: 'to_export' }),
          tradeName: 'Fromagerie Tom',
          holder: 'sas les  tommeuses',
        },
      ],
    };
    const fixture = await render();
    const cell = (fixture.nativeElement as HTMLElement).querySelector('.ab-company');
    expect(cell?.querySelector('strong')?.textContent).toBe('Fromagerie Tom');
    expect(companyCells(fixture)).toEqual(['Fromagerie Tom | SAS Les Tommeuses']);
  });

  it('sans enseigne : la raison sociale une seule fois', async () => {
    service.view = {
      ...VIEW,
      accounts: [
        {
          ...row('rib_a', 'SAS Les Tommeuses', { kind: 'to_export' }),
          holder: 'SAS Les Tommeuses',
        },
      ],
    };
    const fixture = await render();
    expect(companyCells(fixture)).toEqual(['SAS Les Tommeuses']);
  });

  it('nomme le titulaire du RIB quand il diffère', async () => {
    const fixture = await render();
    expect(companyCells(fixture)[0]).toBe('Café A | Titulaire du RIB : Titulaire Café A');
  });
});

describe('les chiffres clés', () => {
  it('montrent les trois comptes, ton d’action sur « à exporter » non nul, zéro atténué', async () => {
    service.view = { ...VIEW, inFlightCount: 0 };
    const fixture = await render();
    expect(figure(fixture, 'to_export').textContent).toContain('1');
    expect(figure(fixture, 'to_export').classList).toContain('ab-figure--action');
    expect(figure(fixture, 'in_flight').classList).toContain('ab-figure--zero');
    expect(figure(fixture, 'known').textContent).toContain('connus de la banque');
  });

  it('filtrent le tableau au clic, et le re-clic rend tout', async () => {
    const fixture = await render();
    const known = figure(fixture, 'known');
    known.click();
    fixture.detectChanges();
    expect(known.getAttribute('aria-pressed')).toBe('true');
    expect(companyCells(fixture).map((cell) => cell.split(' | ')[0])).toEqual([
      'Comptoir C',
      'Dépôt D',
      'Épicerie E',
    ]);
    expect(text(fixture)).toContain('recliquer le chiffre');
    known.click();
    fixture.detectChanges();
    expect(known.getAttribute('aria-pressed')).toBe('false');
    expect(companyCells(fixture)).toHaveLength(VIEW.accounts.length);
  });
});

describe('la carte « Comptes à la banque »', () => {
  it('tabule chaque compte, IBAN masqué, avec son état — écartés compris', async () => {
    const fixture = await render();
    const said = text(fixture);
    expect(said).toContain('Titulaire Café A');
    expect(said).toContain('FR •••• 0143');
    expect(said).toContain('BNPAFRPPXXX');
    expect(said).toContain('à exporter');
    expect(said).toContain('en export');
    expect(said).toContain('saisi dans CENET le 5 octobre 2026');
    expect(said).toContain('signalé par la banque le 6 octobre 2026');
    expect(said).toContain('importé le 2 octobre 2026');
    expect(said).toContain('écarté : RIB sans BIC — compléter le BIC du client');
  });

  const gestures = (fixture: ComponentFixture<AccountBankExportCard>): string[] =>
    [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '[data-gesture]',
      ),
    ].map(
      (node) =>
        `${node.closest('tr')?.textContent?.includes('Café A') === true ? 'a' : 'b'}:${node.dataset['gesture'] ?? ''}`,
    );

  it('un seul geste par état : « importé dans CENET » sur l’à-exporter, rien sur l’en-export avant téléchargement, connu ni écarté', async () => {
    const fixture = await render();
    expect(buttons(fixture, 'Importé dans CENET directement')).toHaveLength(1);
    expect(buttons(fixture, 'Signalé comme connu par la banque')).toHaveLength(0);
    expect(gestures(fixture)).toEqual(['a:entered_in_cenet']);
    expect(text(fixture)).toContain("Téléchargez le fichier d'abord.");
  });

  it('le fichier téléchargé, l’en-export n’offre que « signalé comme connu par la banque »', async () => {
    const fixture = await render();
    buttons(fixture, 'Télécharger le fichier des comptes')[0]?.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(buttons(fixture, 'Signalé comme connu par la banque')).toHaveLength(1);
    });
    expect(gestures(fixture)).toEqual(['a:entered_in_cenet', 'b:reported_by_bank']);
    expect(text(fixture)).not.toContain("Téléchargez le fichier d'abord.");
  });

  it.each([
    ['Importé dans CENET directement', 'rib_a', 'entered_in_cenet', 'saisi à la main dans CENET'],
    [
      'Signalé comme connu par la banque',
      'rib_b',
      'reported_by_bank',
      'compte rendu d’import CENET',
    ],
  ])('« %s » explique, puis déclare avec sa raison', async (label, rib, reason, explained) => {
    service.view = {
      ...VIEW,
      accounts: VIEW.accounts.map((line) =>
        line.standing.kind === 'in_flight'
          ? { ...line, standing: { kind: 'in_flight', downloaded: true } }
          : line,
      ),
    };
    const fixture = await render();
    buttons(fixture, label)[0]?.click();
    fixture.detectChanges();
    expect(text(fixture)).toContain(explained);
    buttons(fixture, 'Confirmer')[0]?.click();
    await fixture.whenStable();
    expect(service.calls).toEqual(['of', `known:le1:${rib}:${reason}`, 'of']);
  });

  it('« Préparer » prépare puis télécharge, et relit la carte', async () => {
    const fixture = await render();
    buttons(fixture, "Préparer l'export des comptes")[0]?.click();
    await fixture.whenStable();
    expect(service.calls).toEqual(['of', 'prepare:le1', 'file:le1:exp_created', 'of']);
  });

  it('émet `changed` après le geste, une fois la carte relue — la procédure recalcule ses onglets', async () => {
    const fixture = await render();
    const seen: string[] = [];
    fixture.componentInstance.changed.subscribe(() => seen.push([...service.calls].pop() ?? ''));
    buttons(fixture, "Préparer l'export des comptes")[0]?.click();
    await fixture.whenStable();
    expect(seen).toEqual(['of']);
  });

  it('rien à exporter : « Préparer » est inactif', async () => {
    service.view = { ...VIEW, toExport: [] };
    const fixture = await render();
    expect(buttons(fixture, "Préparer l'export des comptes")[0]?.disabled).toBe(true);
  });

  it('marquer et abandonner ne s’offrent que sur l’export en attente ; l’abandonné ne se télécharge plus', async () => {
    const fixture = await render();
    expect(buttons(fixture, CENET)).toHaveLength(1);
    expect(buttons(fixture, 'Abandonner')).toHaveLength(1);
    expect(buttons(fixture, 'Télécharger le fichier des comptes')).toHaveLength(1);
    expect(buttons(fixture, 'Télécharger')).toHaveLength(1);
    expect(text(fixture)).toContain('en attente de la banque');
    expect(text(fixture)).toContain('abandonné le 2 septembre 2026');
  });

  it('« déposé dans CENET » est muet tant que le fichier n’a pas été téléchargé, puis s’ouvre', async () => {
    const fixture = await render();
    const before = buttons(fixture, CENET)[0];
    expect(before?.disabled).toBe(true);
    expect(before?.title).toBe("Téléchargez d'abord le fichier");
    expect(text(fixture)).toContain("Téléchargez d'abord le fichier.");

    buttons(fixture, 'Télécharger le fichier des comptes')[0]?.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(buttons(fixture, CENET)[0]?.disabled).toBe(false);
    });
    expect(service.calls).toContain('file:le1:exp_new');
  });

  it('un rechargement garde l’état : déjà téléchargé, le geste est ouvert d’emblée', async () => {
    service.view = {
      ...VIEW,
      exports: VIEW.exports.map((item) =>
        item.id === 'exp_new' ? { ...item, lastDownloadedAt: '2026-10-09T10:00:00.000Z' } : item,
      ),
    };
    const fixture = await render();
    expect(buttons(fixture, CENET)[0]?.disabled).toBe(false);
    expect(text(fixture)).not.toContain("Téléchargez d'abord le fichier.");
  });

  it('lit le refus du serveur même quand il arrive en Blob', async () => {
    service.fileError = new HttpErrorResponse({
      status: 409,
      error: new Blob([JSON.stringify({ message: 'Le fichier ne correspond plus : Café A' })]),
    });
    const fixture = await render();
    buttons(fixture, 'Télécharger')[0]?.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(fixture)).toContain('Le fichier ne correspond plus : Café A');
    });
  });
});

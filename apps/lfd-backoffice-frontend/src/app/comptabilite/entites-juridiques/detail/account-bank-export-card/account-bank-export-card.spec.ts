import { HttpErrorResponse } from '@angular/common/http';
import type { NamedBlob } from '../../../comptabilite-dashboard.service';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  AccountBankExportsView,
  AccountBankRowView,
  AccountBankStandingView,
  LegalEntityView,
} from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountBankExportsService } from '../../../account-bank-exports.service';
import { AccountBankExportCard } from './account-bank-export-card';

/**
 * Ce que la carte tient : le tableau de chaque compte débité (IBAN masqué,
 * BIC, état — écartés compris) ; « importé dans CENET » sur un compte à
 * exporter ; les gestes du compte rendu CENET (« signalé », « rejeté »)
 * grisés dans un export pas encore déposé, ouverts dans un export déposé
 * corrigeable (Hugo, 2026-10-23) ; la barre d'actions au-dessus du tableau —
 * un seul bouton « Télécharger » (prépare s'il n'y a pas d'export ouvert, sinon
 * re-télécharge le même), « déposé dans CENET », « abandonner » ; plus
 * d'historique ni de paragraphe sous le tableau, et le refus du serveur lu
 * même en `Blob`.
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
  bankCollectionLimits: {
    CORE: { perDebitCents: null, perRemittanceCents: null, monthlyCents: null },
    B2B: { perDebitCents: null, perRemittanceCents: null, monthlyCents: null },
  },
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
    row('rib_e', 'Épicerie E', {
      kind: 'imported',
      at: '2026-10-02T09:00:00.000Z',
      exportId: 'exp_old',
      correctable: false,
    }),
    { ...row('rib_x', 'Sans Bic', { kind: 'excluded', reason: 'no_bic' }), bic: null },
  ],
  exports: [
    {
      id: 'exp_new',
      reference: 'EXC-1',
      part: { rank: 1, count: 1 },
      fileName: 'CENET-EXC-1.csv',
      createdAt: '2026-10-09T09:00:00.000Z',
      accountCount: 1,
      lastDownloadedAt: null,
      importedAt: null,
      abandonedAt: null,
    },
    {
      id: 'exp_old',
      reference: 'EXC-2',
      part: { rank: 1, count: 1 },
      fileName: 'CENET-EXC-2.csv',
      createdAt: '2026-10-01T09:00:00.000Z',
      accountCount: 1,
      lastDownloadedAt: '2026-10-01T10:00:00.000Z',
      importedAt: '2026-10-02T09:00:00.000Z',
      abandonedAt: null,
    },
    {
      id: 'exp_ko',
      reference: 'EXC-3',
      part: { rank: 1, count: 1 },
      fileName: 'CENET-EXC-3.csv',
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
  file(entityId: string, exportId: string): Promise<NamedBlob> {
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
      ? Promise.resolve({
          blob: new Blob(['I;x'], { type: 'text/csv' }),
          fileName: 'CENET-EXC-1.csv',
        })
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
  reportKnown(entityId: string, exportId: string, bankAccountId: string): Promise<void> {
    this.calls.push(`reported:${entityId}:${exportId}:${bankAccountId}`);
    return Promise.resolve();
  }
  reject(entityId: string, exportId: string, bankAccountId: string, reason: string): Promise<void> {
    this.calls.push(`rejected:${entityId}:${exportId}:${bankAccountId}:${reason}`);
    return Promise.resolve();
  }
  declareKnown(entityId: string, bankAccountId: string, reason: string): Promise<void> {
    this.calls.push(`known:${entityId}:${bankAccountId}:${reason}`);
    return Promise.resolve();
  }
}

let service: FakeService;

/** Le panneau du motif : rend ce que la personne aurait saisi, ou rien si elle annule. */
class FakePanels {
  reason: string | undefined = 'BIC refusé';
  readonly opened: unknown[] = [];
  open(_component: unknown, options: { readonly data: unknown }) {
    this.opened.push(options.data);
    return { closed: Promise.resolve(this.reason) };
  }
}
let panels: FakePanels;

/** La vue sans export ouvert : seule la préparation reste à offrir. */
function noOpen(): AccountBankExportsView {
  return { ...VIEW, exports: VIEW.exports.filter((item) => item.id !== 'exp_new') };
}

function barTexts(fixture: ComponentFixture<AccountBankExportCard>): string[] {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-action-bar]')].map(
    (node) => node.textContent ?? '',
  );
}

async function render(view?: AccountBankExportsView) {
  if (view !== undefined) service.view = view;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AccountBankExportCard],
    providers: [
      { provide: AccountBankExportsService, useValue: service },
      { provide: FoldPanelHostService, useValue: panels },
    ],
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
  panels = new FakePanels();
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

  it('« importé dans CENET » sur le seul compte à exporter', async () => {
    const fixture = await render();
    expect(buttons(fixture, 'Importé dans CENET directement')).toHaveLength(1);
    expect(gestures(fixture)).toEqual(['a:entered_in_cenet']);
  });

  it('dans un export pas encore déposé, « signalé » et « rejeté » sont visibles mais grisés', async () => {
    const fixture = await render();
    const pending = (fixture.nativeElement as HTMLElement).querySelector('[data-report="pending"]');
    expect(pending?.closest('tr')?.textContent).toContain('Bistrot B');
    const disabled = [...(pending?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    expect(disabled.map((node) => [node.textContent?.trim(), node.disabled])).toEqual([
      ['Signalé comme connu par la banque', true],
      ['Rejeté par la banque', true],
    ]);
    expect(pending?.textContent).toContain('Disponible après le dépôt dans CENET');
  });

  it('un compte importé hors fenêtre du compte rendu n’a plus de geste', async () => {
    const fixture = await render();
    const rowE = [...(fixture.nativeElement as HTMLElement).querySelectorAll('tr')].find((tr) =>
      tr.textContent?.includes('Épicerie E'),
    );
    expect(rowE?.querySelector('[data-report]')).toBeNull();
  });

  /** La vue où Épicerie E vient d'un export déposé, encore corrigeable. */
  const deposited = (): AccountBankExportsView => ({
    ...VIEW,
    accounts: VIEW.accounts.map((line) =>
      line.bankAccountId === 'rib_e'
        ? {
            ...line,
            standing: {
              kind: 'imported',
              at: '2026-10-02T09:00:00.000Z',
              exportId: 'exp_old',
              correctable: true,
            },
          }
        : line,
    ),
  });

  it('déposé : « signalé comme connu par la banque » explique, puis le reporte sur la ligne', async () => {
    const fixture = await render(deposited());
    buttons(fixture, 'Signalé comme connu par la banque')
      .find((node) => !node.disabled)
      ?.click();
    fixture.detectChanges();
    expect(text(fixture)).toContain('compte rendu d’import CENET');
    buttons(fixture, 'Confirmer')[0]?.click();
    await fixture.whenStable();
    expect(service.calls).toEqual(['of', 'reported:le1:exp_old:rib_e', 'of']);
  });

  it('déposé : « rejeté par la banque » demande le motif dans un panneau, puis le reporte', async () => {
    const fixture = await render(deposited());
    buttons(fixture, 'Rejeté par la banque')
      .find((node) => !node.disabled)
      ?.click();
    await fixture.whenStable();
    expect(panels.opened).toEqual([{ subject: 'Épicerie E — FR •••• 0143' }]);
    expect(service.calls).toEqual(['of', 'rejected:le1:exp_old:rib_e:BIC refusé', 'of']);
  });

  it('le panneau du motif fermé sans motif : rien ne part', async () => {
    panels.reason = undefined;
    const fixture = await render(deposited());
    buttons(fixture, 'Rejeté par la banque')
      .find((node) => !node.disabled)
      ?.click();
    await fixture.whenStable();
    expect(service.calls).toEqual(['of']);
  });

  it('« Importé dans CENET directement » explique, puis déclare avec sa raison', async () => {
    const fixture = await render();
    buttons(fixture, 'Importé dans CENET directement')[0]?.click();
    fixture.detectChanges();
    expect(text(fixture)).toContain('saisi à la main dans CENET');
    buttons(fixture, 'Confirmer')[0]?.click();
    await fixture.whenStable();
    expect(service.calls).toEqual(['of', 'known:le1:rib_a:entered_in_cenet', 'of']);
  });

  it('sans export ouvert, « Télécharger » prépare puis télécharge d’un clic, et relit la carte', async () => {
    const fixture = await render(noOpen());
    buttons(fixture, 'Télécharger le fichier des comptes (1 compte)')[0]?.click();
    await fixture.whenStable();
    expect(service.calls).toEqual(['of', 'prepare:le1', 'file:le1:exp_created', 'of']);
  });

  it('émet `changed` après le geste, une fois la carte relue — la procédure recalcule ses onglets', async () => {
    const fixture = await render(noOpen());
    const seen: string[] = [];
    fixture.componentInstance.changed.subscribe(() => seen.push([...service.calls].pop() ?? ''));
    buttons(fixture, 'Télécharger le fichier des comptes (1 compte)')[0]?.click();
    await fixture.whenStable();
    expect(seen).toEqual(['of']);
  });

  it('sans export ouvert ni compte à exporter, la barre ne montre rien', async () => {
    const fixture = await render({ ...noOpen(), toExport: [] });
    expect(barTexts(fixture)).toEqual([]);
  });

  it('un export ouvert : le même bouton télécharge CET export, sans en préparer un autre', async () => {
    const fixture = await render();
    expect(buttons(fixture, CENET)).toHaveLength(1);
    expect(buttons(fixture, 'Abandonner')).toHaveLength(1);
    buttons(fixture, 'Télécharger le fichier des comptes (1 compte)')[0]?.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(buttons(fixture, 'Télécharger à nouveau le fichier')).toHaveLength(1);
    });
    buttons(fixture, 'Télécharger à nouveau le fichier')[0]?.click();
    await fixture.whenStable();
    expect(service.calls.filter((call) => call.startsWith('prepare'))).toEqual([]);
    expect(service.calls.filter((call) => call.startsWith('file'))).toEqual([
      'file:le1:exp_new',
      'file:le1:exp_new',
    ]);
    expect(text(fixture)).not.toContain('autre export ouvert');
  });

  it('plusieurs exports ouverts : la barre traite le plus ancien et compte l’autre', async () => {
    const fixture = await render({
      ...VIEW,
      exports: [
        ...VIEW.exports,
        {
          id: 'exp_first',
          reference: 'EXC-4',
          part: { rank: 1, count: 1 },
          fileName: 'CENET-EXC-4.csv',
          createdAt: '2026-10-08T09:00:00.000Z',
          accountCount: 1,
          lastDownloadedAt: null,
          importedAt: null,
          abandonedAt: null,
        },
      ],
    });
    const bar = (fixture.nativeElement as HTMLElement).querySelector('[data-action-bar]');
    expect(bar?.getAttribute('data-open-export')).toBe('exp_first');
    expect(text(fixture)).toContain('1 autre export ouvert');
  });

  it('« Abandonner » confirme puis abandonne l’export ouvert', async () => {
    const fixture = await render();
    buttons(fixture, 'Abandonner')[0]?.click();
    fixture.detectChanges();
    buttons(fixture, 'La banque l’a rejeté')[0]?.click();
    await fixture.whenStable();
    expect(service.calls).toEqual(['of', 'abandon:le1:exp_new', 'of']);
  });

  it('ni historique des exports ni paragraphe d’explication sous le tableau', async () => {
    const fixture = await render();
    expect(text(fixture)).not.toContain('Préparé le');
    expect(text(fixture)).not.toContain('abandonné le 2 septembre 2026');
    expect(text(fixture)).not.toContain('Télécharger ne vaut pas import');
  });

  it('« déposé dans CENET » est muet tant que le fichier n’a pas été téléchargé, puis s’ouvre', async () => {
    const fixture = await render();
    const before = buttons(fixture, CENET)[0];
    expect(before?.disabled).toBe(true);
    expect(before?.title).toBe("Téléchargez d'abord le fichier");
    expect(text(fixture)).toContain("Téléchargez d'abord le fichier.");

    buttons(fixture, 'Télécharger le fichier des comptes (1 compte)')[0]?.click();
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
    buttons(fixture, 'Télécharger le fichier des comptes (1 compte)')[0]?.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(fixture)).toContain('Le fichier ne correspond plus : Café A');
    });
  });
});

describe('le découpage en fichiers, sur la carte des comptes', () => {
  it('« Fichier 1 sur 2 — 200 comptes », puis ceux qui partiront dans le fichier 2', async () => {
    const [open, ...rest] = VIEW.exports;
    if (open === undefined) {
      throw new TypeError('fixture sans export ouvert');
    }
    const fixture = await render({
      ...VIEW,
      exports: [
        { ...open, reference: 'EXC-12', part: { rank: 1, count: 2 }, accountCount: 200 },
        ...rest,
      ],
    });
    const part = (fixture.nativeElement as HTMLElement).querySelector('[data-part]');
    expect(part?.textContent?.trim()).toBe(
      'EXC-12 · Fichier 1 sur 2 — 200 comptes. Le suivant partira dans le fichier 2, une fois celui-ci déposé dans CENET.',
    );
  });

  it('le dernier fichier de la série ne dit que lui', async () => {
    const [open, ...rest] = VIEW.exports;
    if (open === undefined) {
      throw new TypeError('fixture sans export ouvert');
    }
    const fixture = await render({
      ...VIEW,
      toExport: [],
      exports: [
        { ...open, reference: 'EXC-13', part: { rank: 2, count: 2 }, accountCount: 37 },
        ...rest,
      ],
    });
    expect(text(fixture)).toContain('EXC-13 · Fichier 2 sur 2 — 37 comptes.');
    expect(text(fixture)).not.toContain('suivant');
  });
});

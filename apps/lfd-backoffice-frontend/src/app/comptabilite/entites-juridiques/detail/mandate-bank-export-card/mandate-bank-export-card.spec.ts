import { HttpErrorResponse } from '@angular/common/http';
import type { NamedBlob } from '../../../comptabilite-dashboard.service';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  LegalEntityView,
  MandateBankExportsView,
  MandateBankRowView,
  MandateBankStandingView,
} from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MandateBankExportsService } from '../../../mandate-bank-exports.service';
import { MandateBankExportCard } from './mandate-bank-export-card';

/**
 * Ce que la carte tient, alignée sur celle des comptes le 2026-10-23 (Hugo) :
 * le tableau de chaque mandat actif (débiteur, RUM, IBAN par ses quatre
 * derniers, état — écartés compris, nommés avec leur sortie) ; la barre
 * d'actions au-dessus — un seul bouton « Télécharger » (prépare s'il n'y a
 * pas d'export ouvert, sinon re-télécharge le même), « déposé dans CENET »
 * muet avant téléchargement, « abandonner » ; les gestes du compte rendu
 * CENET grisés avant le dépôt, ouverts après ; plus d'historique ni de
 * paragraphe ; le refus du serveur lu même en `Blob`.
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

function row(
  mandateId: string,
  debtorName: string,
  standing: MandateBankStandingView,
): MandateBankRowView {
  return { mandateId, reference: `RUM-${mandateId}`, debtorName, ibanLast4: '0143', standing };
}

// Les dates ne sont comparées qu'au texte qu'elles produisent, jamais à l'horloge.
const VIEW: MandateBankExportsView = {
  exportableCount: 4,
  toExportCount: 2,
  inFlightCount: 1,
  importedCount: 2,
  excluded: [{ reference: 'RUM-x', debtorName: 'Repris', reason: 'taken_over' }],
  mandates: [
    row('m1', 'Café A', { kind: 'to_export' }),
    row('m2', 'Bistrot B', { kind: 'in_flight', exportId: 'exp_new', downloaded: false }),
    row('m3', 'Comptoir C', {
      kind: 'imported',
      at: '2026-10-02T09:00:00.000Z',
      exportId: 'exp_old',
      correctable: true,
    }),
    row('m4', 'Dépôt D', { kind: 'reported_by_bank', at: '2026-10-03T09:00:00.000Z' }),
    {
      ...row('mx', 'Repris', { kind: 'excluded', reason: 'taken_over' }),
      ibanLast4: null,
    },
  ],
  exports: [
    {
      id: 'exp_new',
      reference: 'EXM-1',
      part: { rank: 1, count: 1 },
      fileName: 'CENET-EXM-1.csv',
      createdAt: '2026-10-09T09:00:00.000Z',
      mandateCount: 1,
      lastDownloadedAt: null,
      importedAt: null,
      abandonedAt: null,
    },
    {
      id: 'exp_old',
      reference: 'EXM-2',
      part: { rank: 1, count: 1 },
      fileName: 'CENET-EXM-2.csv',
      createdAt: '2026-10-01T09:00:00.000Z',
      mandateCount: 1,
      lastDownloadedAt: '2026-10-01T10:00:00.000Z',
      importedAt: '2026-10-02T09:00:00.000Z',
      abandonedAt: null,
    },
  ],
};

/** La vue sans export ouvert : seule la préparation reste à offrir. */
function noOpen(over: Partial<MandateBankExportsView> = {}): MandateBankExportsView {
  return { ...VIEW, exports: VIEW.exports.filter((item) => item.id !== 'exp_new'), ...over };
}

class FakeService {
  view: MandateBankExportsView = VIEW;
  readonly calls: string[] = [];
  fileError: unknown = null;
  of(): Promise<MandateBankExportsView> {
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
    };
    return this.fileError === null
      ? Promise.resolve({
          blob: new Blob(['RUM;x'], { type: 'text/csv' }),
          fileName: 'CENET-EXM-1.csv',
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
  reportKnown(entityId: string, exportId: string, mandateId: string): Promise<void> {
    this.calls.push(`reported:${entityId}:${exportId}:${mandateId}`);
    return Promise.resolve();
  }
  reject(entityId: string, exportId: string, mandateId: string, reason: string): Promise<void> {
    this.calls.push(`rejected:${entityId}:${exportId}:${mandateId}:${reason}`);
    return Promise.resolve();
  }
}

/** Le panneau du motif : rend ce que la personne aurait saisi, ou rien si elle annule. */
class FakePanels {
  reason: string | undefined = 'RUM en double';
  readonly opened: unknown[] = [];
  open(_component: unknown, options: { readonly data: unknown }) {
    this.opened.push(options.data);
    return { closed: Promise.resolve(this.reason) };
  }
}

let service: FakeService;
let panels: FakePanels;

async function render(view?: MandateBankExportsView, ics?: string) {
  if (view !== undefined) service.view = view;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [MandateBankExportCard],
    providers: [
      { provide: MandateBankExportsService, useValue: service },
      { provide: FoldPanelHostService, useValue: panels },
    ],
  });
  const fixture = TestBed.createComponent(MandateBankExportCard);
  fixture.componentRef.setInput('entity', entity(ics === undefined ? {} : { ics }));
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<MandateBankExportCard>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

function buttons(fixture: ComponentFixture<MandateBankExportCard>, label: string) {
  return [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
  ].filter((node) => (node.textContent ?? '').trim() === label);
}

const CENET = "J'ai déposé le fichier dans CENET";

beforeEach(() => {
  service = new FakeService();
  panels = new FakePanels();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

describe('la carte « Mandats à la banque »', () => {
  it('tabule chaque mandat avec son état — écartés compris, nommés avec leur sortie', async () => {
    const fixture = await render();
    const said = text(fixture);
    expect(said).toContain("Importer d'abord les RIB destinataires");
    expect(said).toContain('RUM-m1');
    expect(said).toContain('•••• 0143');
    expect(said).toContain('à exporter');
    expect(said).toContain('en export');
    expect(said).toContain('importé le 2 octobre 2026');
    expect(said).toContain('signalé par la banque le 3 octobre 2026');
    expect(said).toContain('repris d’un autre créancier');
  });

  it('ni historique des exports ni paragraphe d’explication', async () => {
    const fixture = await render();
    expect(text(fixture)).not.toContain('Préparé le');
    expect(text(fixture)).not.toContain('Un mandat révoqué après import');
  });

  it('sans export ouvert, « Télécharger » prépare puis télécharge d’un clic, et relit la carte', async () => {
    const fixture = await render(noOpen());
    buttons(fixture, 'Télécharger le fichier des mandats (2 mandats)')[0]?.click();
    await fixture.whenStable();
    expect(service.calls).toEqual(['of', 'prepare:le1', 'file:le1:exp_created', 'of']);
  });

  it('émet `changed` après le geste, une fois la carte relue', async () => {
    const fixture = await render(noOpen());
    const seen: string[] = [];
    fixture.componentInstance.changed.subscribe(() => seen.push([...service.calls].pop() ?? ''));
    buttons(fixture, 'Télécharger le fichier des mandats (2 mandats)')[0]?.click();
    await fixture.whenStable();
    expect(seen).toEqual(['of']);
  });

  /** Hugo, 2026-10-23 : la banque rejette tout l'import si un mandat lui est connu. */
  it('rien à exporter : le bouton est inactif, et aucune case « tous » ne le rouvre', async () => {
    const fixture = await render(noOpen({ toExportCount: 0 }));
    expect(buttons(fixture, 'Télécharger le fichier des mandats (0 mandat)')[0]?.disabled).toBe(
      true,
    );
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('input[type="checkbox"]'),
    ).toBeNull();
  });

  it('le bouton porte le nombre « à exporter », plafonné à 200', async () => {
    const fixture = await render(noOpen({ toExportCount: 212 }));
    expect(buttons(fixture, 'Télécharger le fichier des mandats (200 mandats)')).toHaveLength(1);
  });

  it('montre « à exporter » et « en attente de la banque » tels que servis', async () => {
    const fixture = await render(VIEW);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('En attente de la banque');
    expect(text).toMatch(/À exporter\s*2 mandats/u);
    expect(text).toMatch(/En attente de la banque\s*1 mandat(?!s)/u);
  });

  it('sans ICS, le bouton est inactif et la carte dit pourquoi', async () => {
    const fixture = await render(noOpen(), '');
    expect(buttons(fixture, 'Télécharger le fichier des mandats (2 mandats)')[0]?.disabled).toBe(
      true,
    );
    expect(text(fixture)).toContain("Attribuer d'abord l'identifiant créancier (ICS)");
  });

  it('un export ouvert : le même bouton télécharge CET export, puis « à nouveau », sans en préparer un autre', async () => {
    const fixture = await render();
    expect(buttons(fixture, CENET)[0]?.disabled).toBe(true);
    expect(text(fixture)).toContain("Téléchargez d'abord le fichier.");
    buttons(fixture, 'Télécharger le fichier des mandats (1 mandat)')[0]?.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(buttons(fixture, 'Télécharger à nouveau le fichier')).toHaveLength(1);
    });
    expect(buttons(fixture, CENET)[0]?.disabled).toBe(false);
    buttons(fixture, 'Télécharger à nouveau le fichier')[0]?.click();
    await fixture.whenStable();
    expect(service.calls.filter((call) => call.startsWith('prepare'))).toEqual([]);
    expect(service.calls.filter((call) => call.startsWith('file'))).toEqual([
      'file:le1:exp_new',
      'file:le1:exp_new',
    ]);
  });

  it('« J’ai déposé le fichier dans CENET », confirmé, marque importé', async () => {
    const fixture = await render({
      ...VIEW,
      exports: VIEW.exports.map((item) =>
        item.id === 'exp_new' ? { ...item, lastDownloadedAt: '2026-10-09T10:00:00.000Z' } : item,
      ),
    });
    buttons(fixture, CENET)[0]?.click();
    fixture.detectChanges();
    buttons(fixture, 'La banque l’a importé')[0]?.click();
    await fixture.whenStable();
    expect(service.calls).toEqual(['of', 'imported:le1:exp_new', 'of']);
  });

  it('« Abandonner », confirmé, abandonne l’export ouvert', async () => {
    const fixture = await render();
    buttons(fixture, 'Abandonner')[0]?.click();
    fixture.detectChanges();
    buttons(fixture, 'La banque l’a rejeté')[0]?.click();
    await fixture.whenStable();
    expect(service.calls).toEqual(['of', 'abandon:le1:exp_new', 'of']);
  });

  it('avant le dépôt, « signalé » et « rejeté » sont visibles mais grisés', async () => {
    const fixture = await render();
    const pending = (fixture.nativeElement as HTMLElement).querySelector('[data-report="pending"]');
    expect(pending?.closest('tr')?.textContent).toContain('Bistrot B');
    expect(
      [...(pending?.querySelectorAll<HTMLButtonElement>('button') ?? [])].map(
        (node) => node.disabled,
      ),
    ).toEqual([true, true]);
    expect(pending?.textContent).toContain('Disponible après le dépôt dans CENET');
  });

  it('déposé : « signalé comme connu par la banque » se confirme puis se reporte sur la ligne', async () => {
    const fixture = await render();
    buttons(fixture, 'Signalé comme connu par la banque')
      .find((node) => !node.disabled)
      ?.click();
    fixture.detectChanges();
    buttons(fixture, 'Confirmer')[0]?.click();
    await fixture.whenStable();
    expect(service.calls).toEqual(['of', 'reported:le1:exp_old:m3', 'of']);
  });

  it('déposé : « rejeté par la banque » demande le motif dans un panneau, puis le reporte', async () => {
    const fixture = await render();
    buttons(fixture, 'Rejeté par la banque')
      .find((node) => !node.disabled)
      ?.click();
    await fixture.whenStable();
    expect(panels.opened).toEqual([{ subject: 'Comptoir C — RUM-m3' }]);
    expect(service.calls).toEqual(['of', 'rejected:le1:exp_old:m3:RUM en double', 'of']);
  });

  it('lit le refus du serveur même quand il arrive en Blob (409 sur le fichier)', async () => {
    service.fileError = new HttpErrorResponse({
      status: 409,
      error: new Blob([JSON.stringify({ message: 'Le fichier ne correspond plus : RUM-m2' })]),
    });
    const fixture = await render();
    buttons(fixture, 'Télécharger le fichier des mandats (1 mandat)')[0]?.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(fixture)).toContain('Le fichier ne correspond plus : RUM-m2');
    });
  });
});

describe('le découpage en fichiers, sur la carte des mandats', () => {
  it('dit le numéro, le rang et ceux qui attendent le fichier suivant', async () => {
    const [open, ...rest] = VIEW.exports;
    if (open === undefined) {
      throw new TypeError('fixture sans export ouvert');
    }
    const fixture = await render({
      ...VIEW,
      toExportCount: 12,
      inFlightCount: 200,
      exports: [
        { ...open, reference: 'EXM-4', part: { rank: 1, count: 2 }, mandateCount: 200 },
        ...rest,
      ],
    });
    const part = (fixture.nativeElement as HTMLElement).querySelector('[data-part]');
    // « À exporter » ne compte plus les 200 en vol : les 12 attendent le fichier 2.
    expect(part?.textContent?.trim()).toBe(
      'EXM-4 · Fichier 1 sur 2 — 200 mandats. Les 12 suivants partiront dans le fichier 2, une fois celui-ci déposé dans CENET.',
    );
  });
});

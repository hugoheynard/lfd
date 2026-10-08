import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { LegalEntityView, MandateBankExportsView } from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MandateBankExportsService } from '../../../mandate-bank-exports.service';
import { MandateBankExportCard } from './mandate-bank-export-card';

/**
 * Ce que la carte tient : les écartés NOMMÉS avec leur sortie, « Préparer »
 * inactif quand il n'y a rien à exporter (sauf « tous »), préparer puis
 * télécharger, « Marquer importé » seulement sur un export qui ne l'est pas,
 * et le refus du serveur lu même quand il arrive en `Blob`.
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
  collectionDaysAfterClosure: null,
  depositCutoff: null,
  nextCollection: {
    closesAt: '2026-10-31T23:00:00.000Z',
    plannedConstitutionAt: '2026-11-01T00:00:00.000Z',
    collectionDay: '2026-11-16',
    depositDeadline: null,
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
};

const VIEW: MandateBankExportsView = {
  exportableCount: 2,
  toExportCount: 1,
  importedCount: 1,
  excluded: [{ reference: 'RUM-3', debtorName: 'Bistrot Sans Bic', reason: 'no_bic' }],
  exports: [
    {
      id: 'exp_new',
      createdAt: '2026-10-09T09:00:00.000Z',
      mandateCount: 1,
      importedAt: null,
    },
    {
      id: 'exp_old',
      createdAt: '2026-10-01T09:00:00.000Z',
      mandateCount: 1,
      importedAt: '2026-10-02T09:00:00.000Z',
    },
  ],
};

class FakeService {
  view: MandateBankExportsView = VIEW;
  readonly calls: string[] = [];
  fileError: unknown = null;
  of(): Promise<MandateBankExportsView> {
    this.calls.push('of');
    return Promise.resolve(this.view);
  }
  prepare(entityId: string, all: boolean): Promise<string> {
    this.calls.push(`prepare:${entityId}:${String(all)}`);
    return Promise.resolve('exp_created');
  }
  file(entityId: string, exportId: string): Promise<Blob> {
    this.calls.push(`file:${entityId}:${exportId}`);
    return this.fileError === null
      ? Promise.resolve(new Blob(['x;'], { type: 'text/csv' }))
      : Promise.reject(this.fileError);
  }
  markImported(entityId: string, exportId: string): Promise<void> {
    this.calls.push(`imported:${entityId}:${exportId}`);
    return Promise.resolve();
  }
}

let service: FakeService;

async function render(over: Partial<Pick<LegalEntityView, 'ics'>> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [MandateBankExportCard],
    providers: [{ provide: MandateBankExportsService, useValue: service }],
  });
  const fixture = TestBed.createComponent(MandateBankExportCard);
  fixture.componentRef.setInput('entity', entity(over));
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<MandateBankExportCard>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

function button(
  fixture: ComponentFixture<MandateBankExportCard>,
  label: string,
): HTMLButtonElement | undefined {
  return [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
  ].find((node) => (node.textContent ?? '').trim() === label);
}

async function settle(fixture: ComponentFixture<MandateBankExportCard>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

beforeEach(() => {
  service = new FakeService();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
  // `saveBlob` clique un lien : jsdom ne navigue pas, et le dirait en erreur.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

describe('la carte « Mandats à la banque »', () => {
  it('dit l’ordre de la banque, compte, et nomme chaque écarté avec sa sortie', async () => {
    const fixture = await render();
    const said = text(fixture);
    expect(said).toContain("Importer d'abord les RIB destinataires (modèle attendu de la banque)");
    expect(said).toContain('1 mandat');
    expect(said).toContain('RUM-3 — Bistrot Sans Bic');
    expect(said).toContain('RIB sans BIC — compléter le BIC du client');
  });

  it('« Préparer l’export » prépare puis télécharge, et relit la carte', async () => {
    const fixture = await render();
    button(fixture, "Préparer l'export")?.click();
    await settle(fixture);
    expect(service.calls).toEqual(['of', 'prepare:le1:false', 'file:le1:exp_created', 'of']);
  });

  it('rien à exporter : « Préparer » est inactif, sauf en cochant « tous »', async () => {
    service.view = { ...VIEW, toExportCount: 0 };
    const fixture = await render();
    expect(button(fixture, "Préparer l'export")?.disabled).toBe(true);
  });

  it('sans ICS, « Préparer » est inactif et la carte dit pourquoi', async () => {
    const fixture = await render({ ics: '' });
    expect(button(fixture, "Préparer l'export")?.disabled).toBe(true);
    expect(text(fixture)).toContain("Attribuer d'abord l'identifiant créancier (ICS)");
  });

  it('« Marquer importé » n’apparaît que sur l’export qui ne l’est pas', async () => {
    const fixture = await render();
    const marks = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].filter(
      (node) => (node.textContent ?? '').trim() === 'Marquer importé',
    );
    expect(marks).toHaveLength(1);
    expect(text(fixture)).toContain('pas encore importé');
    expect(text(fixture)).toContain('importé le 2 octobre 2026');
  });

  it('lit le refus du serveur même quand il arrive en Blob (409 sur le fichier)', async () => {
    service.fileError = new HttpErrorResponse({
      status: 409,
      error: new Blob([JSON.stringify({ message: 'Le fichier ne correspond plus : RUM-1' })]),
    });
    const fixture = await render();
    button(fixture, 'Télécharger')?.click();
    // La lecture du `Blob` est hors de la zone que `whenStable` attend.
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(fixture)).toContain('Le fichier ne correspond plus : RUM-1');
    });
  });
});

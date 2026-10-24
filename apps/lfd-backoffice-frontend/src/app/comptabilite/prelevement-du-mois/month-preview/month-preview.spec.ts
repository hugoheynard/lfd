import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CollectionPreviewView, LegalEntityView } from '@lfd/contracts';

import { ComptabiliteDashboardService } from '../../comptabilite-dashboard.service';
import { MonthPreview } from './month-preview';

/**
 * La carte de l'aperçu, seule : ses signalements, et l'échec d'un
 * téléchargement qui DIT au lieu de se taire.
 */

const ENTITY: Partial<LegalEntityView> = {
  billingModes: [],
  id: 'le1',
  siren: '552100554',
  nextCollection: {
    closesAt: '2026-10-31T23:00:00.000Z',
    plannedConstitutionAt: '2026-11-01T00:00:00.000Z',
    collectionDay: '2026-11-16',
    depositDeadline: null,
    tightDepositMargin: null,
  },
};

const PREVIEW: CollectionPreviewView = {
  state: 'open',
  cycleStartsAt: '2026-09-30T22:00:00.000Z',
  cycleClosesAt: '2026-10-31T23:00:00.000Z',
  floorAt: '2026-08-01T00:00:00.000Z',
  lines: [],
  totalCents: 0,
  ordersTotalCents: 0,
  gapCents: 0,
  payerModes: ['monthly'],
  exclusions: [
    {
      orderId: 'o1',
      orderNumber: 'CMD-7',
      companyName: 'Café du Quai',
      placedAt: '2026-10-03T08:00:00.000Z',
      amountCents: 1_000,
      reason: 'unbillable',
    },
  ],
  unmandatedCompanies: ['Chalet Sans Mandat'],
};

async function render(
  drafts: Partial<ComptabiliteDashboardService>,
  preview: CollectionPreviewView = PREVIEW,
): Promise<ComponentFixture<MonthPreview>> {
  TestBed.configureTestingModule({
    imports: [MonthPreview],
    providers: [provideRouter([]), { provide: ComptabiliteDashboardService, useValue: drafts }],
  });
  const fixture = TestBed.createComponent(MonthPreview);
  fixture.componentRef.setInput('entity', ENTITY);
  fixture.componentRef.setInput('preview', preview);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe('MonthPreview', () => {
  it('nomme les sans-mandat et les non facturables, et liste les bons écartés', async () => {
    const host = (await render({})).nativeElement as HTMLElement;

    expect(host.querySelector('[data-unmandated]')?.textContent).toContain('Chalet Sans Mandat');
    expect(host.querySelector('[data-unbillable]')?.textContent).toContain('CMD-7 (Café du Quai)');
    expect(host.querySelector('[data-preview-exclusions]')?.textContent).toContain('CMD-7');
    expect(host.querySelector('[data-empty]')).toBeNull();
  });

  /**
   * L'écart est servi par le serveur (`gapCents`) : l'écran ne soustrait plus
   * deux montants (revue du 2026-10-24). Un écart volontairement distinct de
   * la soustraction prouve qu'il lit le champ.
   */
  it("affiche l'écart que sert le serveur, sans le recalculer", async () => {
    const host = (await render({}, { ...PREVIEW, gapCents: -7 })).nativeElement as HTMLElement;

    expect(host.querySelector('[data-preview-gap]')?.textContent).toContain('−0,07');
  });

  it("l'écart d'une ligne est celui que sert le serveur", async () => {
    const line = {
      scheme: 'B2B' as const,
      payerCompanyId: 'c1',
      debtorName: 'Boulangerie du Port',
      orderCount: 1,
      amountCents: 100,
      ordersTotalCents: 100,
      gapCents: -9,
    };
    const host = (await render({}, { ...PREVIEW, lines: [line] })).nativeElement as HTMLElement;

    expect(host.textContent).toContain('−0,09');
  });

  it('un téléchargement refusé le dit', async () => {
    const fixture = await render({
      cycleDraft: () => Promise.reject({ error: { message: 'Aperçu refusé.' } }),
    });
    const host = fixture.nativeElement as HTMLElement;
    const draft = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Aperçu du fichier CORE'),
    );

    draft?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.textContent).toContain('Aperçu refusé.');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Venu du tableau de bord avec les aperçus du fichier (PA4). */
  it('sans `Content-Disposition`, retombe sur un nom suffixé du schéma', async () => {
    const names: string[] = [];
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:brouillon');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    const fixture = await render({
      cycleDraftAudit: () => Promise.resolve({ blob: new Blob(['x']), fileName: null }),
    });
    const audit = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('Contrôle CSV B2B'));

    audit?.click();
    await fixture.whenStable();

    expect(names).toEqual(['CONTROLE-prelevement-552100554-B2B.csv']);
  });
});

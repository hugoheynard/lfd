import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ProductionGrouping, ProductionSettingsView, StaffPermission } from '@lfd/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { ProductionSettingsService } from '../production-settings.service';
import { WorkstationsService } from '../workstations.service';
import { ProductionSimulationPage } from './production-simulation-page';

const PROD_WITH_SUBCATEGORIES: ProductionSettingsView = {
  automaticClose: null,
  closedDays: [],
  tranches: { mode: 'fixed', fixedTranches: [] },
  display: { showSubcategories: true, grouping: 'workstation' },
};

class FakeWorkstations {
  readonly asked: { mode: ProductionGrouping; showSubcategories: boolean }[] = [];
  refusal: HttpErrorResponse | null = null;
  async simulationPdf(mode: ProductionGrouping, showSubcategories: boolean): Promise<Blob> {
    this.asked.push({ mode, showSubcategories });
    if (this.refusal !== null) {
      throw this.refusal;
    }
    return new Blob(['%PDF'], { type: 'application/pdf' });
  }
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

async function mount(
  granted: readonly StaffPermission[],
  workstations = new FakeWorkstations(),
): Promise<{
  fixture: ComponentFixture<ProductionSimulationPage>;
  workstations: FakeWorkstations;
}> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProductionSimulationPage],
    providers: [
      { provide: WorkstationsService, useValue: workstations },
      {
        provide: ProductionSettingsService,
        useValue: { settings: async () => PROD_WITH_SUBCATEGORIES },
      },
      {
        provide: PermissionsStore,
        useValue: {
          can: (permission: StaffPermission) => granted.includes(permission),
          loaded: signal(true),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ProductionSimulationPage);
  fixture.detectChanges();
  await settle();
  fixture.detectChanges();
  return { fixture, workstations };
}

describe('Simuler le dossier de prod', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('part du réglage en vigueur, et simule avec les choix pris', async () => {
    vi.spyOn(window, 'open').mockReturnValue(window);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:simulation');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    const { fixture, workstations } = await mount([
      'production_workstations:read',
      'production_settings:read',
    ]);
    const page = fixture.componentInstance;

    expect(page['mode']()).toBe('workstation');
    expect(page['showSubcategories']()).toBe(true);

    page['chooseSubcategories']('hidden');
    await page['simulate']();

    expect(workstations.asked).toEqual([{ mode: 'workstation', showSubcategories: false }]);
    expect(window.open).toHaveBeenCalledWith('blob:simulation', '_blank');
  });

  it('sans le droit du réglage : part du mode boutique sans sous-catégories, et le dit', async () => {
    const { fixture } = await mount(['production_workstations:read']);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('fold-page-layout')).not.toBeNull();
    expect(el.querySelector('[data-setting-unread]')).not.toBeNull();
    expect(fixture.componentInstance['mode']()).toBe('shelf');
    expect(fixture.componentInstance['showSubcategories']()).toBe(false);
  });

  it('montre le refus du serveur tel quel', async () => {
    const workstations = new FakeWorkstations();
    workstations.refusal = new HttpErrorResponse({
      status: 500,
      error: { message: 'Les postes n’ont pas pu être lus : la simulation est refusée.' },
    });
    const { fixture } = await mount(['production_workstations:read'], workstations);

    await fixture.componentInstance['simulate']();
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-simulation-refusal]')
        ?.textContent,
    ).toContain('Les postes n’ont pas pu être lus');
  });

  it('onglet bloqué : un lien de téléchargement à la place', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:simulation');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    const { fixture } = await mount(['production_workstations:read']);

    await fixture.componentInstance['simulate']();
    fixture.detectChanges();

    const link = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-simulation-blocked] a',
    );
    expect(link?.getAttribute('href')).toBe('blob:simulation');
    expect(link?.getAttribute('download')).toBe('simulation-boutique.pdf');
  });
});

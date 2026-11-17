import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ProductionDisplayPayload, ProductionDisplayView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { ProductionSettingsService } from '../../production-settings.service';
import { WorkstationsService } from '../../workstations.service';
import { ProductionGroupingCard } from './production-grouping-card';

class FakeSettings {
  readonly saved: ProductionDisplayPayload[] = [];
  refusal: HttpErrorResponse | null = null;
  async saveDisplay(payload: ProductionDisplayPayload): Promise<void> {
    this.saved.push(payload);
    if (this.refusal !== null) {
      throw this.refusal;
    }
  }
}

let settings: FakeSettings;

async function mount(
  display: ProductionDisplayView | null,
  unplacedOrdered: number,
): Promise<{ fixture: ComponentFixture<ProductionGroupingCard>; saves: number[] }> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProductionGroupingCard],
    providers: [
      { provide: ProductionSettingsService, useValue: settings },
      { provide: WorkstationsService, useValue: {} },
    ],
  });
  const fixture = TestBed.createComponent(ProductionGroupingCard);
  fixture.componentRef.setInput('display', display);
  fixture.componentRef.setInput('unplacedOrdered', unplacedOrdered);
  fixture.componentRef.setInput('canWrite', true);
  fixture.componentRef.setInput('canRead', true);
  const saves: number[] = [];
  fixture.componentInstance.saved.subscribe(() => saves.push(1));
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, saves };
}

const SHOP: ProductionDisplayView = { showSubcategories: true, grouping: 'shelf' };

/** Une microtâche : l'enregistrement part dans une promesse. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

describe('le rangement du fournil', () => {
  beforeEach(() => {
    settings = new FakeSettings();
  });

  it('passe en mode prod sans confirmation quand tout ce qui est commandé a un poste', async () => {
    const { fixture, saves } = await mount(SHOP, 0);

    fixture.componentInstance['choose']('workstation');
    await settle();

    expect(settings.saved).toEqual([{ showSubcategories: true, grouping: 'workstation' }]);
    expect(saves).toHaveLength(1);
  });

  it('demande une confirmation qui donne le compte des produits commandés sans poste', async () => {
    const { fixture } = await mount(SHOP, 4);
    const card = fixture.componentInstance;

    card['choose']('workstation');
    fixture.detectChanges();

    expect(settings.saved).toEqual([]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-grouping-confirm]')?.textContent).toContain('4 produits');

    card['confirm']();
    await settle();
    expect(settings.saved).toEqual([{ showSubcategories: true, grouping: 'workstation' }]);
  });

  it('annuler la confirmation n’envoie rien', async () => {
    const { fixture } = await mount(SHOP, 2);
    const card = fixture.componentInstance;

    card['choose']('workstation');
    card['cancel']();

    expect(card['confirming']()).toBe(false);
    expect(settings.saved).toEqual([]);
  });

  it('montre le refus du serveur tel quel', async () => {
    settings.refusal = new HttpErrorResponse({
      status: 409,
      error: {
        message:
          'Aucun produit n’a de poste : rangez-les depuis la page Postes, ou partez de “Simuler le catalogue en production”.',
      },
    });
    const { fixture, saves } = await mount(SHOP, 0);

    fixture.componentInstance['choose']('workstation');
    await settle();
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-grouping-refusal]')?.textContent,
    ).toContain('Aucun produit n’a de poste');
    expect(saves).toEqual([]);
  });

  /**
   * Régression : le refus « aucun produit n'a de poste » restait affiché après
   * « Partir des rayons », qui venait pourtant de placer les produits
   * (essai dans Chrome du 2026-11-17).
   */
  it('efface le refus dès que les postes changent', async () => {
    settings.refusal = new HttpErrorResponse({
      status: 409,
      error: { message: 'Aucun produit n’a de poste.' },
    });
    const { fixture } = await mount(SHOP, 0);
    fixture.componentInstance['choose']('workstation');
    await settle();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-grouping-refusal]')).not.toBeNull();

    fixture.componentRef.setInput('unplacedOrdered', 12);
    fixture.detectChanges();

    expect(host.querySelector('[data-grouping-refusal]')).toBeNull();
  });

  it('revenir en mode boutique part sans confirmation', async () => {
    const { fixture } = await mount({ showSubcategories: false, grouping: 'workstation' }, 9);

    fixture.componentInstance['choose']('shelf');
    await settle();

    expect(settings.saved).toEqual([{ showSubcategories: false, grouping: 'shelf' }]);
  });

  it('dit quand le réglage n’a pas pu être lu', async () => {
    const { fixture } = await mount(null, 0);

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-grouping-unknown]'),
    ).not.toBeNull();
  });
});

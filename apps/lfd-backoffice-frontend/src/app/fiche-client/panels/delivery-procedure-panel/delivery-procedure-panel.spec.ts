import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  DeliveryAddressView,
  DeliveryProcedureStepView,
  DeliveryProcedureView,
  DeliveryStepFields,
} from '@lfd/contracts';
import { DELIVERY_PROCEDURE_MAX_STEPS } from '@lfd/contracts';
import {
  DeliveryProcedureConflictError,
  DeliveryProcedureGateway,
  type DeliveryStepPhotoChange,
} from '@lfd/b2b-ui/company';
import { FoldPanelRef, provideFoldInlineConfirmLabels } from 'fold-ng';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminDeliveryProcedurePanel } from './delivery-procedure-panel';

/**
 * Le panneau staff, et à travers lui l'éditeur partagé `lfd-delivery-procedure-editor`
 * — éprouvé ici parce que le runner de `@lfd/b2b-ui` est Node, sans banc Angular.
 * La passerelle est doublée : ce qu'on tient, c'est la chorégraphie lire → écrire
 * → relire, et ce que l'écran en montre.
 */

function step(
  id: string,
  number: number,
  over: Partial<DeliveryProcedureStepView> = {},
): DeliveryProcedureStepView {
  return { id, number, title: `Étape ${id}`, body: '', photoRevision: null, ...over };
}

class FakeGateway extends DeliveryProcedureGateway {
  steps: DeliveryProcedureStepView[] = [];
  loads = 0;
  reorders: (readonly string[])[] = [];
  added: { fields: DeliveryStepFields; photo: Blob | null }[] = [];
  revised: { stepId: string; fields: DeliveryStepFields; change: DeliveryStepPhotoChange }[] = [];
  removed: string[] = [];
  reorderError: unknown = null;

  load(): Promise<DeliveryProcedureView> {
    this.loads += 1;
    return Promise.resolve({ addressId: 'adr_1', steps: this.steps });
  }

  addStep(_addressId: string, fields: DeliveryStepFields, photo: Blob | null): Promise<string> {
    this.added.push({ fields, photo });
    this.steps = [...this.steps, step(`new${this.steps.length}`, this.steps.length + 1, fields)];
    return Promise.resolve('new');
  }

  reviseStep(
    _addressId: string,
    stepId: string,
    fields: DeliveryStepFields,
    change: DeliveryStepPhotoChange,
  ): Promise<void> {
    this.revised.push({ stepId, fields, change });
    return Promise.resolve();
  }

  removeStep(_addressId: string, stepId: string): Promise<void> {
    this.removed.push(stepId);
    this.steps = this.steps.filter((s) => s.id !== stepId).map((s, i) => ({ ...s, number: i + 1 }));
    return Promise.resolve();
  }

  reorder(_addressId: string, stepIds: readonly string[]): Promise<void> {
    this.reorders.push(stepIds);
    if (this.reorderError !== null) {
      return Promise.reject(this.reorderError);
    }
    this.steps = stepIds.map((id, i) => ({
      ...(this.steps.find((s) => s.id === id) ?? step(id, i + 1)),
      number: i + 1,
    }));
    return Promise.resolve();
  }

  photo(): Promise<Blob> {
    return Promise.resolve(new Blob(['jpeg'], { type: 'image/jpeg' }));
  }
}

const ADDRESS: DeliveryAddressView = {
  id: 'adr_1',
  label: 'Boutique',
  ligne1: '12 avenue Foch',
  ligne2: '',
  codePostal: '92100',
  ville: 'Boulogne',
  pays: 'France',
  isDefault: true,
  procedureStepCount: 0,
  specs: {
    note: '',
    slots: { mode: 'everyday', slot: null },
    deliveryContact: null,
    gps: null,
    signatureRequired: false,
  },
};

describe('AdminDeliveryProcedurePanel', () => {
  let gateway: FakeGateway;
  let counts: number[];

  beforeEach(() => {
    gateway = new FakeGateway();
    counts = [];
    // jsdom ne fabrique pas d'URL d'objet : les vignettes n'en ont besoin que pour s'afficher.
    URL.createObjectURL = vi.fn(() => 'blob:vignette');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => TestBed.resetTestingModule());

  async function render(): Promise<ComponentFixture<AdminDeliveryProcedurePanel>> {
    TestBed.configureTestingModule({
      imports: [AdminDeliveryProcedurePanel],
      providers: [
        { provide: DeliveryProcedureGateway, useValue: gateway },
        { provide: FoldPanelRef, useValue: new FoldPanelRef(1, () => undefined) },
        // Comme `app.config.ts` : fold parle anglais par défaut.
        provideFoldInlineConfirmLabels({ confirm: 'Confirmer', cancel: 'Annuler' }),
      ],
    });
    const fixture = TestBed.createComponent(AdminDeliveryProcedurePanel);
    fixture.componentRef.setInput('data', {
      address: ADDRESS,
      onStepCountChange: (count: number) => counts.push(count),
    });
    await settle(fixture);
    return fixture;
  }

  async function settle(fixture: ComponentFixture<AdminDeliveryProcedurePanel>): Promise<void> {
    for (let i = 0; i < 4; i += 1) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
    fixture.detectChanges();
  }

  function text(fixture: ComponentFixture<AdminDeliveryProcedurePanel>): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function buttons(
    fixture: ComponentFixture<AdminDeliveryProcedurePanel>,
    label: string,
  ): HTMLButtonElement[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].filter(
      (b) => (b.textContent ?? '').trim() === label || b.getAttribute('aria-label') === label,
    );
  }

  it('sans étape, dit qu’il n’y a pas de procédure et propose d’en ajouter une', async () => {
    const fixture = await render();

    expect(text(fixture)).toContain('Aucune procédure de livraison');
    expect(buttons(fixture, 'Ajouter une étape')).toHaveLength(1);
  });

  it('numérote les étapes et désactive monter/descendre aux bornes', async () => {
    gateway.steps = [step('a', 1, { title: 'Portail' }), step('b', 2, { title: 'Cour' })];
    const fixture = await render();

    expect(text(fixture)).toContain('Étape 1');
    expect(text(fixture)).toContain('Portail');
    const ups = buttons(fixture, 'Monter l’étape');
    const downs = buttons(fixture, 'Descendre l’étape');
    expect(ups.map((b) => b.disabled)).toEqual([true, false]);
    expect(downs.map((b) => b.disabled)).toEqual([false, true]);
  });

  it('descendre envoie l’ordre complet, puis relit — l’écran suit le serveur', async () => {
    gateway.steps = [step('a', 1, { title: 'Portail' }), step('b', 2, { title: 'Cour' })];
    const fixture = await render();
    const loadsBefore = gateway.loads;

    buttons(fixture, 'Descendre l’étape')[0]?.click();
    await settle(fixture);

    expect(gateway.reorders).toEqual([['b', 'a']]);
    expect(gateway.loads).toBe(loadsBefore + 1);
    const titles = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('fold-element-title'),
    ].map((el) => el.getAttribute('ng-reflect-title') ?? el.textContent ?? '');
    expect(titles.join('|').indexOf('Cour')).toBeLessThan(titles.join('|').indexOf('Portail'));
  });

  it('un conflit dit que la procédure a changé, et recharge', async () => {
    gateway.steps = [step('a', 1), step('b', 2)];
    gateway.reorderError = new DeliveryProcedureConflictError('changé');
    const fixture = await render();
    const loadsBefore = gateway.loads;

    buttons(fixture, 'Descendre l’étape')[0]?.click();
    await settle(fixture);

    expect(text(fixture)).toContain('La procédure a changé entre-temps');
    expect(gateway.loads).toBe(loadsBefore + 1);
  });

  it(`masque « Ajouter une étape » à ${DELIVERY_PROCEDURE_MAX_STEPS} étapes`, async () => {
    gateway.steps = Array.from({ length: DELIVERY_PROCEDURE_MAX_STEPS }, (_, i) =>
      step(`s${i}`, i + 1),
    );
    const fixture = await render();

    expect(buttons(fixture, 'Ajouter une étape')).toHaveLength(0);
    expect(text(fixture)).toContain(`au plus ${DELIVERY_PROCEDURE_MAX_STEPS} étapes`);
  });

  it('refaire préremplit, n’arme Enregistrer qu’une fois modifié, et garde la photo', async () => {
    gateway.steps = [step('a', 1, { title: 'Portail', body: 'Code 4512', photoRevision: 'rev1' })];
    const fixture = await render();

    buttons(fixture, 'Refaire')[0]?.click();
    await settle(fixture);
    const save = buttons(fixture, 'Enregistrer')[0];
    expect(save?.disabled).toBe(true);

    const title = (fixture.nativeElement as HTMLElement).querySelector(
      'fold-input input',
    ) as HTMLInputElement;
    expect(title.value).toBe('Portail');
    title.value = 'Grand portail';
    title.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(save?.disabled).toBe(false);

    save?.click();
    await settle(fixture);
    expect(gateway.revised).toEqual([
      {
        stepId: 'a',
        fields: { title: 'Grand portail', body: 'Code 4512' },
        change: { kind: 'keep' },
      },
    ]);
  });

  it('ajouter une étape émet le nouveau nombre d’étapes', async () => {
    const fixture = await render();

    buttons(fixture, 'Ajouter une étape')[0]?.click();
    await settle(fixture);
    const title = (fixture.nativeElement as HTMLElement).querySelector(
      'fold-input input',
    ) as HTMLInputElement;
    title.value = 'Sonner à l’interphone';
    title.dispatchEvent(new Event('input'));
    await settle(fixture);
    buttons(fixture, 'Ajouter l’étape')[0]?.click();
    await settle(fixture);

    expect(gateway.added).toEqual([
      { fields: { title: 'Sonner à l’interphone', body: '' }, photo: null },
    ]);
    expect(counts).toEqual([1]);
    expect(text(fixture)).toContain('Sonner à l’interphone');
  });

  it('la suppression dit « définitivement » avant de supprimer', async () => {
    gateway.steps = [step('a', 1, { title: 'Portail' })];
    const fixture = await render();

    buttons(fixture, 'Refaire')[0]?.click();
    await settle(fixture);
    expect(text(fixture)).toContain('définitivement');
    buttons(fixture, 'Supprimer l’étape')[0]?.click();
    await settle(fixture);
    buttons(fixture, 'Confirmer')[0]?.click();
    await settle(fixture);

    expect(gateway.removed).toEqual(['a']);
    expect(counts).toEqual([0]);
  });
});

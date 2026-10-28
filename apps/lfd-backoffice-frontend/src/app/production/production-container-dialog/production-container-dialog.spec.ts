import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { ProductionContainerRule } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { ProductionContainersService } from '../production-containers.service';
import {
  ProductionContainerDialog,
  type ProductionContainerDialogData,
} from './production-container-dialog';

/** Le dialogue du contenant principal (plan fournée v3, §5). */

class FakeContainers {
  readonly calls: string[] = [];
  refuse: string | null = null;
  private gate(): Promise<void> {
    return this.refuse === null
      ? Promise.resolve()
      : Promise.reject(
          new HttpErrorResponse({ status: 400, error: { code: 'x', message: this.refuse } }),
        );
  }
  set(sku: string, rule: ProductionContainerRule): Promise<void> {
    this.calls.push(`set:${sku}:${JSON.stringify(rule)}`);
    return this.gate();
  }
  remove(sku: string): Promise<void> {
    this.calls.push(`remove:${sku}`);
    return this.gate();
  }
}

const PLAQUE = { sku: 'VIE-001', unitsPerContainer: 24, singular: 'plaque', plural: 'plaques' };

async function mount(data: Partial<ProductionContainerDialogData> = {}) {
  const api = new FakeContainers();
  const closed: (boolean | undefined)[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProductionContainerDialog],
    providers: [
      { provide: ProductionContainersService, useValue: api },
      { provide: FoldPanelRef, useValue: { close: (value?: boolean) => closed.push(value) } },
    ],
  });
  const fixture = TestBed.createComponent(ProductionContainerDialog);
  fixture.componentRef.setInput('data', {
    sku: 'VIE-001',
    productName: 'Croissant',
    container: null,
    canWrite: true,
    ...data,
  } satisfies ProductionContainerDialogData);
  fixture.detectChanges();
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  };
  const field = (selector: string): HTMLInputElement | null =>
    root.querySelector<HTMLInputElement>(`${selector} input`);
  const type = (selector: string, value: string): void => {
    const input = field(selector);
    if (input !== null) {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }
  };
  const submit = (): HTMLButtonElement | null =>
    root.querySelector<HTMLButtonElement>('[data-container-submit]');
  return { api, closed, fixture, root, settle, field, type, submit };
}

describe('ProductionContainerDialog', () => {
  it('règle un contenant neuf : singulier, pluriel, pièces', async () => {
    const { api, closed, root, settle, type, submit } = await mount();

    expect(submit()?.disabled).toBe(true);
    type('[data-container-singular]', ' plaque ');
    type('[data-container-plural]', 'plaques');
    type('[data-container-units]', '24');
    submit()?.click();
    await settle();

    expect(api.calls).toEqual([
      'set:VIE-001:{"unitsPerContainer":24,"singular":"plaque","plural":"plaques"}',
    ]);
    expect(closed).toEqual([true]);
    expect(root.querySelector('fold-danger-zone')).toBeNull();
  });

  it('au poids : le champ dit « Grammes », et règle en grammes (P6, vente au poids)', async () => {
    const { api, root, settle, type, submit } = await mount({ saleUnit: 'weight' });

    expect(root.querySelector('[data-container-units]')?.textContent).toContain('Grammes');
    type('[data-container-singular]', 'plaque');
    type('[data-container-plural]', 'plaques');
    type('[data-container-units]', '1500');
    submit()?.click();
    await settle();

    expect(api.calls).toEqual([
      'set:VIE-001:{"unitsPerContainer":1500,"singular":"plaque","plural":"plaques"}',
    ]);
  });

  it('refuse de partir sans pluriel', async () => {
    const { type, submit } = await mount();

    type('[data-container-singular]', 'plaque');
    type('[data-container-units]', '24');

    expect(submit()?.disabled).toBe(true);
  });

  it('préremplit un contenant réglé, et le remplace', async () => {
    const { api, field, type, submit, settle } = await mount({ container: PLAQUE });

    expect(field('[data-container-units]')?.value).toBe('24');
    expect(field('[data-container-singular]')?.value).toBe('plaque');
    type('[data-container-units]', '30');
    submit()?.click();
    await settle();

    expect(api.calls).toEqual([
      'set:VIE-001:{"unitsPerContainer":30,"singular":"plaque","plural":"plaques"}',
    ]);
  });

  it('dit le refus du serveur sur place, sans fermer', async () => {
    const { api, closed, root, settle, submit } = await mount({ container: PLAQUE });
    api.refuse = 'au moins une pièce par contenant';

    submit()?.click();
    await settle();

    expect(closed).toEqual([]);
    expect(root.querySelector('[data-container-refusal]')?.textContent).toContain(
      'au moins une pièce',
    );
  });

  it('retire un contenant réglé par la zone de suppression confirmée', async () => {
    const { api, closed, fixture, settle } = await mount({ container: PLAQUE });

    fixture.debugElement.query(By.css('fold-danger-zone')).triggerEventHandler('confirmed', '');
    await settle();

    expect(api.calls).toEqual(['remove:VIE-001']);
    expect(closed).toEqual([true]);
  });

  it('sans le droit d’écrire : rien à enregistrer ni à retirer', async () => {
    const { root } = await mount({ container: PLAQUE, canWrite: false });

    expect(root.querySelector('[data-container-submit]')).toBeNull();
    expect(root.querySelector('fold-danger-zone')).toBeNull();
  });
});

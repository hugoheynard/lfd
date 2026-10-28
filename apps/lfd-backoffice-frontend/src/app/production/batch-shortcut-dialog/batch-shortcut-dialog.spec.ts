import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { CreateBatchShortcutPayload, UpdateBatchShortcutPayload } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { BatchShortcutsService } from '../batch-shortcuts.service';
import { BatchShortcutDialog, type BatchShortcutDialogData } from './batch-shortcut-dialog';

/** Le dialogue d'un raccourci du fournil (plan des raccourcis, S1). */

class FakeShortcuts {
  readonly calls: string[] = [];
  refuse: string | null = null;
  private gate(): Promise<void> {
    return this.refuse === null
      ? Promise.resolve()
      : Promise.reject(
          new HttpErrorResponse({ status: 409, error: { code: 'x', message: this.refuse } }),
        );
  }
  async create(payload: CreateBatchShortcutPayload): Promise<string> {
    this.calls.push(`create:${JSON.stringify(payload)}`);
    await this.gate();
    return 'bs-new';
  }
  update(id: string, payload: UpdateBatchShortcutPayload): Promise<void> {
    this.calls.push(`update:${id}:${JSON.stringify(payload)}`);
    return this.gate();
  }
  remove(id: string): Promise<void> {
    this.calls.push(`remove:${id}`);
    return this.gate();
  }
}

const EXISTING = { id: 'bs-1', sku: 'VIE-001', label: '1 plaque', pieces: 24, position: 0 };

async function mount(data: Partial<BatchShortcutDialogData> = {}) {
  const api = new FakeShortcuts();
  const closed: (boolean | undefined)[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BatchShortcutDialog],
    providers: [
      { provide: BatchShortcutsService, useValue: api },
      { provide: FoldPanelRef, useValue: { close: (value?: boolean) => closed.push(value) } },
    ],
  });
  const fixture = TestBed.createComponent(BatchShortcutDialog);
  fixture.componentRef.setInput('data', {
    sku: 'VIE-001',
    productName: 'Croissant',
    shortcut: null,
    canWrite: true,
    ...data,
  } satisfies BatchShortcutDialogData);
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
  return { api, closed, fixture, root, settle, field, type };
}

describe('BatchShortcutDialog', () => {
  it('propose « 1 plaque » à l’ajout, et crée avec les pièces saisies', async () => {
    const { api, closed, root, settle, field, type } = await mount();

    expect(field('[data-shortcut-label]')?.value).toBe('1 plaque');
    expect(root.querySelector<HTMLButtonElement>('[data-shortcut-submit]')?.disabled).toBe(true);
    type('[data-shortcut-pieces]', '24');
    root.querySelector<HTMLButtonElement>('[data-shortcut-submit]')?.click();
    await settle();

    expect(api.calls).toEqual(['create:{"sku":"VIE-001","label":"1 plaque","pieces":24}']);
    expect(closed).toEqual([true]);
    expect(root.querySelector('fold-danger-zone')).toBeNull();
  });

  it('dit le refus du serveur sur place, sans fermer', async () => {
    const { api, closed, root, settle, type } = await mount();
    api.refuse = 'Le produit VIE-001 a déjà un raccourci « 1 plaque ».';

    type('[data-shortcut-pieces]', '12');
    root.querySelector<HTMLButtonElement>('[data-shortcut-submit]')?.click();
    await settle();

    expect(closed).toEqual([]);
    expect(root.querySelector('[data-shortcut-refusal]')?.textContent).toContain(
      'déjà un raccourci',
    );
  });

  it('en modification, enregistre le nom et les pièces', async () => {
    const { api, closed, root, settle, field, type } = await mount({ shortcut: EXISTING });

    expect(field('[data-shortcut-pieces]')?.value).toBe('24');
    type('[data-shortcut-label]', '1 grande plaque');
    root.querySelector<HTMLButtonElement>('[data-shortcut-submit]')?.click();
    await settle();

    expect(api.calls).toEqual(['update:bs-1:{"label":"1 grande plaque","pieces":24}']);
    expect(closed).toEqual([true]);
  });

  it('en modification, supprime par la zone de suppression confirmée', async () => {
    const { api, closed, fixture, settle } = await mount({ shortcut: EXISTING });

    const zone = fixture.debugElement.query(By.css('fold-danger-zone'));
    zone.triggerEventHandler('confirmed', '');
    await settle();

    expect(api.calls).toEqual(['remove:bs-1']);
    expect(closed).toEqual([true]);
  });

  it('sans le droit d’écrire : rien à enregistrer ni à supprimer', async () => {
    const { root } = await mount({ shortcut: EXISTING, canWrite: false });

    expect(root.querySelector('[data-shortcut-submit]')).toBeNull();
    expect(root.querySelector('fold-danger-zone')).toBeNull();
  });
});

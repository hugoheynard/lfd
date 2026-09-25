import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { DirectDebitBlocksService } from '../../direct-debit-blocks.service';
import { BLOCK_REASON_MAX, BlockDialog } from './block-dialog';

/**
 * La raison est obligatoire et bornée (1–500) : l'écran n'envoie pas ce que le
 * serveur refuserait. Un refus du serveur reste dans le dialogue, mot pour mot,
 * et le dialogue reste ouvert.
 */

class FakeApi {
  calls: { companyId: string; reason: string }[] = [];
  refuse: unknown = null;

  block(companyId: string, reason: string): Promise<void> {
    if (this.refuse !== null) {
      return Promise.reject(this.refuse);
    }
    this.calls.push({ companyId, reason });
    return Promise.resolve();
  }
}

interface Rendered {
  readonly fixture: ComponentFixture<BlockDialog>;
  readonly closedWith: (boolean | undefined)[];
}

async function render(api: FakeApi): Promise<Rendered> {
  const closedWith: (boolean | undefined)[] = [];
  TestBed.configureTestingModule({
    imports: [BlockDialog],
    providers: [
      { provide: DirectDebitBlocksService, useValue: api },
      {
        provide: FoldPanelRef,
        useValue: new FoldPanelRef<boolean>(1, (result) => closedWith.push(result)),
      },
    ],
  });
  const fixture = TestBed.createComponent(BlockDialog);
  fixture.componentRef.setInput('data', { companyId: 'c1', companyName: 'Le Lac' });
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, closedWith };
}

function type(fixture: ComponentFixture<BlockDialog>, value: string): void {
  const area = (fixture.nativeElement as HTMLElement).querySelector('textarea');
  if (area === null) {
    throw new Error('textarea introuvable');
  }
  area.value = value;
  area.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function submitButton(fixture: ComponentFixture<BlockDialog>): HTMLButtonElement {
  const all = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button');
  const found = Array.from(all).find((b) => b.textContent?.trim() === 'Bloquer');
  if (found === undefined) {
    throw new Error('bouton Bloquer introuvable');
  }
  return found;
}

describe('BlockDialog', () => {
  it('ne permet pas de bloquer sans raison', async () => {
    const { fixture } = await render(new FakeApi());
    expect(submitButton(fixture).disabled).toBe(true);

    type(fixture, '   ');
    expect(submitButton(fixture).disabled).toBe(true);
  });

  it('refuse une raison de plus de 500 caractères', async () => {
    const { fixture } = await render(new FakeApi());
    type(fixture, 'x'.repeat(BLOCK_REASON_MAX + 1));
    expect(submitButton(fixture).disabled).toBe(true);

    type(fixture, 'x'.repeat(BLOCK_REASON_MAX));
    expect(submitButton(fixture).disabled).toBe(false);
  });

  it('envoie la raison nettoyée, et ferme sur un succès', async () => {
    const api = new FakeApi();
    const { fixture, closedWith } = await render(api);
    type(fixture, '  Deux rejets  ');

    submitButton(fixture).click();
    await fixture.whenStable();

    expect(api.calls).toEqual([{ companyId: 'c1', reason: 'Deux rejets' }]);
    expect(closedWith).toEqual([true]);
  });

  it('un refus du serveur reste dans le dialogue, avec ses mots', async () => {
    const api = new FakeApi();
    api.refuse = { status: 409, error: { message: 'Ce client paie déjà en carte.' } };
    const { fixture, closedWith } = await render(api);
    type(fixture, 'Mandat contesté');

    submitButton(fixture).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Ce client paie déjà en carte.',
    );
    expect(closedWith).toEqual([]);
  });
});

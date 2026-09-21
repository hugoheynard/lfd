import { TestBed } from '@angular/core/testing';

import { FR } from '../../../copy/fr';
import type { CompletionItem, CompletionTarget } from '../completion-items';
import { CompletionCallout } from './completion-callout';

const TEXTS = FR.account.completion.items;

const IDENTITY: CompletionItem = {
  key: 'identity',
  ...TEXTS.identity,
  card: 'identity',
  target: 'identity',
  blocking: true,
};

const VAT: CompletionItem = {
  key: 'vat',
  ...TEXTS.vat,
  card: 'identity',
  target: 'identity',
  blocking: true,
};

function mount(items: readonly CompletionItem[]): {
  el: HTMLElement;
  emitted: CompletionTarget[];
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [CompletionCallout] });
  const fixture = TestBed.createComponent(CompletionCallout);
  fixture.componentRef.setInput('items', items);
  const emitted: CompletionTarget[] = [];
  fixture.componentInstance.act.subscribe((target) => emitted.push(target));
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, emitted };
}

describe('CompletionCallout', () => {
  it('ne rend rien sans élément', () => {
    expect(mount([]).el.querySelector('fold-callout')).toBeNull();
  });

  it('liste les éléments de la carte dans un encart inset d’avertissement', () => {
    const { el } = mount([IDENTITY, VAT]);
    const callout = el.querySelector('fold-callout');

    expect(callout?.getAttribute('appearance')).toBe('inset');
    expect(callout?.getAttribute('variant')).toBe('warning');
    expect(el.textContent).toContain(FR.account.completion.cardLead);
    expect(Array.from(el.querySelectorAll('li')).map((li) => li.textContent?.trim())).toEqual([
      `${TEXTS.identity.title} — ${TEXTS.identity.detail}`,
      `${TEXTS.vat.title} — ${TEXTS.vat.detail}`,
    ]);
  });

  it('un seul geste par dialogue, qui émet sa cible', () => {
    const { el, emitted } = mount([IDENTITY, VAT]);
    const buttons = el.querySelectorAll<HTMLButtonElement>('button.gesture');

    expect(buttons.length).toBe(1);
    expect(buttons[0]?.textContent?.trim()).toBe(TEXTS.identity.action);
    buttons[0]?.click();
    expect(emitted).toEqual(['identity']);
  });

  it('pas de geste pour un élément sans action — le rôle ne peut pas écrire là', () => {
    const { el } = mount([{ ...IDENTITY, action: '' }]);
    expect(el.querySelector('li')).not.toBeNull();
    expect(el.querySelector('button.gesture')).toBeNull();
  });
});

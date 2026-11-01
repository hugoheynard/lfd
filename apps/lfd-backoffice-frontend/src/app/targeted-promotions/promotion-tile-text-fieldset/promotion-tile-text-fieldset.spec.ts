import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { NO_TILE_TEXT, type DraftTileText } from '../promotion-tile-text';
import { PromotionTileTextFieldset } from './promotion-tile-text-fieldset';

async function render(text: DraftTileText, preview: string | null, disabled = false) {
  const fixture = TestBed.createComponent(PromotionTileTextFieldset);
  fixture.componentRef.setInput('text', text);
  fixture.componentRef.setInput('preview', preview);
  fixture.componentRef.setInput('disabled', disabled);
  const emitted: DraftTileText[] = [];
  fixture.componentInstance.textChange.subscribe((next) => emitted.push(next));
  await fixture.whenStable();
  fixture.detectChanges();
  return { root: fixture.nativeElement as HTMLElement, emitted };
}

const type = (root: HTMLElement, selector: string, value: string) => {
  const field = root.querySelector<HTMLInputElement>(`${selector} input`);
  if (field === null) {
    throw new Error(`champ absent : ${selector}`);
  }
  field.value = value;
  field.dispatchEvent(new Event('input'));
};

describe('PromotionTileTextFieldset', () => {
  it('montre l’aperçu de ce que la vignette dira', async () => {
    const { root } = await render(NO_TILE_TEXT, '−20 %');
    expect(root.querySelector('[data-tile-text-preview]')?.textContent).toContain('−20 %');
  });

  it('sans aperçu lisible, ne montre rien', async () => {
    const { root } = await render(NO_TILE_TEXT, null);
    expect(root.querySelector('[data-tile-text-preview]')).toBeNull();
  });

  it('publie le texte saisi, langue par langue', async () => {
    const { root, emitted } = await render(NO_TILE_TEXT, '−20 %');
    type(root, '[data-tile-text-en]', '−20% Folie Coffee');
    expect(emitted.at(-1)).toEqual({ fr: '', en: '−20% Folie Coffee', it: '' });
  });

  it('désactivée, ne publie rien', async () => {
    const { root, emitted } = await render(NO_TILE_TEXT, '−20 %', true);
    type(root, '[data-tile-text-fr]', 'x');
    expect(emitted).toEqual([]);
  });
});

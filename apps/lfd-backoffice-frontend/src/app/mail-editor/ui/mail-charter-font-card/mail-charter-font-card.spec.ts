import { TestBed } from '@angular/core/testing';
import type { MailCharterFont } from '@lfd/mail-blocks';
import { describe, expect, it } from 'vitest';

import { MailCharterFontCard } from './mail-charter-font-card';

const POGONIA: MailCharterFont = {
  family: 'Pogonia',
  url: 'https://lfc.test/brand/fonts/pogonia-400.woff2',
  fallback: 'Arial, sans-serif',
};

function setup(font: MailCharterFont | null, readOnly = false) {
  TestBed.configureTestingModule({ imports: [MailCharterFontCard] });
  const fixture = TestBed.createComponent(MailCharterFontCard);
  fixture.componentRef.setInput('slot', 'textFont');
  fixture.componentRef.setInput('heading', 'Police du texte');
  fixture.componentRef.setInput('toggleLabel', 'Une police web pour le texte');
  fixture.componentRef.setInput('font', font);
  fixture.componentRef.setInput('readOnly', readOnly);
  fixture.componentRef.setInput('violations', [
    {
      code: 'charter-font-fallback-invalid',
      field: 'textFont.fallback',
      message: 'Secours du texte',
    },
    {
      code: 'charter-font-fallback-invalid',
      field: 'headingFont.fallback',
      message: 'Secours des titres',
    },
  ]);
  const emitted: (MailCharterFont | null)[] = [];
  fixture.componentInstance.fontChange.subscribe((next) => emitted.push(next));
  fixture.detectChanges();
  return { element: fixture.nativeElement as HTMLElement, emitted };
}

describe('MailCharterFontCard', () => {
  it('sans police, ne montre que la case', () => {
    const { element } = setup(null);
    expect(element.textContent).toContain('Police du texte');
    expect(element.querySelector('[data-font-toggle]')).not.toBeNull();
    expect(element.querySelector('[data-font-family]')).toBeNull();
  });

  it('montre le nom, l’adresse et le secours, et les refus de SA police seulement', () => {
    const { element } = setup(POGONIA);
    expect(element.querySelector('[data-font-family]')).not.toBeNull();
    expect(element.querySelector('[data-font-url]')).not.toBeNull();
    expect(element.querySelector('[data-font-fallback]')).not.toBeNull();
    const refusals = [...element.querySelectorAll('[data-violation]')].map((node) =>
      node.textContent?.trim(),
    );
    expect(refusals).toEqual(['Secours du texte']);
  });

  it('remonte une police complète à chaque saisie', () => {
    const { element, emitted } = setup(POGONIA);
    const field = element.querySelector<HTMLInputElement>('[data-font-fallback] input');
    if (field !== null) {
      field.value = 'Georgia, serif';
      field.dispatchEvent(new Event('input'));
    }
    expect(emitted).toEqual([{ ...POGONIA, fallback: 'Georgia, serif' }]);
  });

  it('garde les graisses posées par « polices de la boutique » quand on retouche un champ', () => {
    const weighted = { ...POGONIA, weights: { '700': 'https://lfc.test/p-700.woff2' } };
    const { element, emitted } = setup(weighted);
    const field = element.querySelector<HTMLInputElement>('[data-font-family] input');
    if (field !== null) {
      field.value = 'Pogonia Text';
      field.dispatchEvent(new Event('input'));
    }
    expect(emitted).toEqual([{ ...weighted, family: 'Pogonia Text' }]);
  });
});

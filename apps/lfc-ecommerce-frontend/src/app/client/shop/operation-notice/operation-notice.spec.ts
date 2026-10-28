import { TestBed } from '@angular/core/testing';
import type { ShopOperationView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { testOperation } from '../shop-catalogue.fixture';
import { OperationNotice } from './operation-notice';

function render(operation: ShopOperationView): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [OperationNotice] });
  const fixture = TestBed.createComponent(OperationNotice);
  fixture.componentRef.setInput('operation', operation);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe("OperationNotice — l'encart d'un rayon d'opération", () => {
  it('annoncée : le nom, le chapeau, l’image et les trois dates en clair', () => {
    const root = render({
      ...testOperation('announced'),
      lede: { fr: 'Neuf bûches, une semaine.' },
      image: { url: 'https://media.example.test/noel.jpg', alt: 'Une bûche' },
      announceFrom: '2026-11-01T08:00:00.000Z',
    });
    const text = root.textContent ?? '';
    expect(text).toContain('Noël');
    expect(text).toContain('Neuf bûches, une semaine.');
    expect(text).toContain('Commandes à partir du 15 nov.');
    expect(text).toContain('Commandez avant le 21 déc.');
    expect(text).toContain('Retrait du 20 au 24 déc.');
    expect(root.querySelector('img')?.getAttribute('alt')).toBe('Une bûche');
  });

  it('sans photo : le logo de la maison, cadré entier', () => {
    const img = render({ ...testOperation('announced'), image: null }).querySelector('img');
    expect(img?.getAttribute('src')).toBe('brand/lfc-mark.png');
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.hasAttribute('data-house-mark')).toBe(true);
  });

  it('ouverte : l’ouverture ne se dit plus', () => {
    const root = render({ ...testOperation('open'), announceFrom: '2026-11-01T08:00:00.000Z' });
    expect(root.textContent).not.toContain('Commandes à partir du');
    expect(root.textContent).toContain('Commandez avant le 21 déc.');
  });

  it('commandes ouvertes et rayon vide : « Les produits arrivent bientôt »', () => {
    const root = render({
      ...testOperation('open'),
      skus: [],
      announceFrom: '2026-11-01T08:00:00.000Z',
      awaitingProducts: true,
    });
    expect(root.querySelector('fold-callout')?.textContent).toContain(
      'Les produits arrivent bientôt',
    );
  });

  it('l’heure de clôture montrée : le jour et l’heure de Paris', () => {
    const root = render({
      ...testOperation('open'),
      announceFrom: '2026-11-01T08:00:00.000Z',
      showsOrderUntilTime: true,
    });
    expect(root.textContent).toContain('Commandez avant le 21 déc. à 12:00');
  });

  it('l’heure de clôture éteinte : le jour seul', () => {
    const root = render({
      ...testOperation('open'),
      announceFrom: '2026-11-01T08:00:00.000Z',
      showsOrderUntilTime: false,
    });
    expect(root.textContent).toContain('Commandez avant le 21 déc.');
    expect(root.textContent).not.toContain('12:00');
  });

  it('sans le champ (interrupteur fermé) : le jour seul, comme avant', () => {
    const root = render(testOperation('open'));
    expect(root.textContent).not.toContain('12:00');
  });

  it('sans attente, aucun callout', () => {
    const root = render({ ...testOperation('open'), announceFrom: '2026-11-01T08:00:00.000Z' });
    expect(root.querySelector('fold-callout')).toBeNull();
  });
});

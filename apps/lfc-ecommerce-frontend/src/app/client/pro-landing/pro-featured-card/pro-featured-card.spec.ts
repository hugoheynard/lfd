import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { FeaturedCard } from '../pro-landing';
import { ProFeaturedCard } from './pro-featured-card';

const CARD: FeaturedCard = {
  sku: 'PAIN-001',
  name: 'Baguette tradition',
  note: 'Levain naturel, cuite le matin',
  label: 'Se connecter pour voir le tarif de Baguette tradition',
  src: 'https://media.example/baguette-grande.jpg?w=560',
  srcset: 'https://media.example/baguette-grande.jpg?w=560 560w',
  position: '50% 30%',
};

describe('ProFeaturedCard — un incontournable de /pro', () => {
  let fixture: ComponentFixture<ProFeaturedCard>;
  let activations: number;

  async function render(card: FeaturedCard): Promise<HTMLElement> {
    fixture.componentRef.setInput('card', card);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function control(host: HTMLElement): HTMLElement | null {
    return host.querySelector<HTMLElement>('[role="button"]');
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(ProFeaturedCard);
    activations = 0;
    fixture.componentInstance.activated.subscribe(() => (activations += 1));
  });

  it('rend la grande image, le nom, la note — et aucun prix', async () => {
    const host = await render(CARD);
    const img = host.querySelector('img');
    expect(img?.getAttribute('src')).toBe(CARD.src);
    expect(img?.getAttribute('srcset')).toBe(CARD.srcset);
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.style.objectPosition).toBe('50% 30%');
    expect(host.querySelector('.name')?.textContent?.trim()).toBe('Baguette tradition');
    expect(host.querySelector('.note')?.textContent?.trim()).toBe(CARD.note);
    expect(host.textContent).not.toMatch(/€|HT|TTC/);
  });

  it('sans note, aucun paragraphe vide', async () => {
    const host = await render({ ...CARD, note: null });
    expect(host.querySelector('.note')).toBeNull();
  });

  it('un seul contrôle, avec le libellé de connexion ; clic et Entrée l’activent', async () => {
    const host = await render(CARD);
    const card = control(host);
    expect(card?.getAttribute('aria-label')).toBe(CARD.label);
    card?.click();
    card?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(activations).toBe(2);
  });
});

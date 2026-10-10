import type { ShopOperationView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { FR as fr } from '../copy/fr';
import { datedEventOf, featuredOperation, parisDaysUntil } from './operation-event';

const DAY = 86_400_000;
const NOW = new Date();
const at = (days: number): string => new Date(NOW.getTime() + days * DAY).toISOString();
const day = (days: number): string => at(days).slice(0, 10);

function op(over: Partial<ShopOperationView> = {}): ShopOperationView {
  return {
    key: 'noel',
    name: { fr: 'Noël', en: 'Christmas' },
    lede: { fr: 'Neuf bûches.' },
    image: { url: 'https://media.example.test/noel.jpg', alt: 'Une bûche' },
    state: 'open',
    orderFrom: at(-3),
    orderUntil: at(9),
    pickupFrom: day(12),
    pickupUntil: day(14),
    skus: [],
    ...over,
  };
}

describe('featuredOperation — la plus pertinente', () => {
  it('aucune opération : null', () => {
    expect(featuredOperation([])).toBeNull();
  });

  it('les commandes ouvertes passent avant une annoncée plus proche', () => {
    const announced = op({ key: 'a', state: 'announced', orderFrom: at(1) });
    const open = op({ key: 'o', state: 'open', orderUntil: at(20) });
    expect(featuredOperation([announced, open])?.key).toBe('o');
  });

  it('à état égal, la clôture la plus proche', () => {
    const far = op({ key: 'far', orderUntil: at(20) });
    const near = op({ key: 'near', orderUntil: at(4) });
    expect(featuredOperation([far, near])?.key).toBe('near');
  });

  it('une close ne passe qu’en dernier', () => {
    const closed = op({ key: 'c', state: 'closed' });
    const announced = op({ key: 'a', state: 'announced', orderFrom: at(30) });
    expect(featuredOperation([closed, announced])?.key).toBe('a');
  });
});

describe('datedEventOf — la carte', () => {
  it('ouverte : décompte jusqu’à la clôture, sans pastille d’état', () => {
    const event = datedEventOf(op(), NOW, 'fr', fr);
    expect(event.countdown).toBe(`J‑${String(parisDaysUntil(at(9), NOW))}`);
    expect(event.badge).toBeNull();
    expect(event.title).toBe('Noël');
    expect(event.teaser).toBe('Neuf bûches.');
    expect(event.dates.startsWith('Retrait du ')).toBe(true);
    expect(event.route).toBe('/boutique');
    // La carte mène au RAYON de l'opération, pas seulement à la boutique.
    expect(event.queryParams).toEqual({ rayon: 'op:noel' });
  });

  it('ouverte, le jour de la clôture : « Dernier jour »', () => {
    expect(datedEventOf(op({ orderUntil: NOW.toISOString() }), NOW, 'fr', fr).countdown).toBe(
      'Dernier jour',
    );
  });

  it('annoncée : décompte jusqu’à l’ouverture, et la date d’ouverture en pastille', () => {
    const event = datedEventOf(op({ state: 'announced', orderFrom: at(5) }), NOW, 'fr', fr);
    expect(event.countdown).toBe(`J‑${String(parisDaysUntil(at(5), NOW))}`);
    expect(event.badge?.startsWith('Ouvre le ')).toBe(true);
  });

  it('close : « Commandes closes », pas de décompte', () => {
    const event = datedEventOf(op({ state: 'closed' }), NOW, 'fr', fr);
    expect(event.badge).toBe('Commandes closes');
    expect(event.countdown).toBeNull();
  });

  it('l’image du fonds est servie redimensionnée, avec son jeu de largeurs', () => {
    const image = datedEventOf(op(), NOW, 'fr', fr).image;
    expect(image?.src).toContain('/cdn-cgi/image/width=900');
    expect(image?.srcset).toContain('1800w');
    expect(image?.alt).toBe('Une bûche');
  });

  it('sans image ni accroche : rien d’inventé', () => {
    const event = datedEventOf(op({ image: null, lede: null }), NOW, 'fr', fr);
    expect(event.image).toBeNull();
    expect(event.teaser).toBe('');
  });

  it('dans la langue de l’interface, le français faute de mieux', () => {
    expect(datedEventOf(op(), NOW, 'en', fr).title).toBe('Christmas');
    expect(datedEventOf(op(), NOW, 'it', fr).title).toBe('Noël');
  });
});

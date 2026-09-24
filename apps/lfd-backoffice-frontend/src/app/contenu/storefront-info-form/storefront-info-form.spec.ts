import { TestBed } from '@angular/core/testing';
import type { StorefrontCatalogOperation } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type { PickedMedia } from '../../pim/catalogue/library-picker/library-picker';
import type { ShelfOption } from '../storefront-catalog';
import { emptyInfo, type InfoContent } from '../storefront-text';
import { StorefrontInfoForm } from './storefront-info-form';

/**
 * Le formulaire ne garde rien : chaque saisie rend l'info entière. Ce qu'on
 * tient ici — une langue à la fois, un texte facultatif vidé disparaît, et
 * l'image choisie dans la médiathèque arrive SANS texte alternatif.
 */
const SHELVES: readonly ShelfOption[] = [
  { key: 'all', label: 'Tout' },
  { key: 'op:noel-2026', label: 'Opération · Noël', operation: true },
  { key: 'choc', label: 'Chocolat & confiserie' },
];

const NOEL: StorefrontCatalogOperation = {
  key: 'noel-2026',
  name: { fr: 'Noël', en: 'Christmas' },
  lede: { fr: 'Bûches et papillotes.' },
  image: { url: 'https://cdn.example/buche.jpg', alt: 'Une bûche' },
  state: 'closed',
  announceFrom: '2026-10-31T23:00:00.000Z',
  orderFrom: '2026-11-14T23:00:00.000Z',
  orderUntil: '2026-12-21T11:00:00.000Z',
  pickupFrom: '2026-12-20',
  pickupUntil: '2026-12-24',
};

const IMAGE: PickedMedia = {
  url: 'https://cdn.example/paques.jpg',
  name: 'Pâques',
  width: 1200,
  height: 800,
  bytes: 1000,
  contentType: 'image/jpeg',
};

function setup(info: InfoContent = emptyInfo(), picked: readonly PickedMedia[] = [IMAGE]) {
  const opened: unknown[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (_component: unknown, options: { data: unknown }) => {
            opened.push(options.data);
            return { closed: Promise.resolve(picked) };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(StorefrontInfoForm);
  fixture.componentRef.setInput('info', info);
  fixture.componentRef.setInput('shelves', SHELVES);
  fixture.componentRef.setInput('operations', [NOEL]);
  fixture.detectChanges();
  const form = fixture.componentInstance;
  const changes: InfoContent[] = [];
  form.changed.subscribe((value) => changes.push(value));
  return { fixture, form, changes, opened };
}

describe('StorefrontInfoForm', () => {
  it('écrit le titre dans la langue choisie', () => {
    const { form, changes } = setup({ ...emptyInfo(), title: { fr: 'Pâques' } });
    form['pickLocale']('en');
    form['setTitle']('Easter');
    expect(changes.at(-1)?.title).toEqual({ fr: 'Pâques', en: 'Easter' });
  });

  it('une pastille vidée dans toutes ses langues disparaît', () => {
    const { form, changes } = setup({ ...emptyInfo(), badge: { fr: 'Nouveau' } });
    form['setOptional']('badge', '');
    expect(changes.at(-1)?.badge).toBeNull();
  });

  it('choisit UNE image dans la médiathèque, sans texte alternatif — jamais l’URL', async () => {
    const { form, changes, opened } = setup();
    form['chooseImage']();
    await Promise.resolve();
    await Promise.resolve();
    expect(opened).toEqual([{ already: [], single: true }]);
    expect(changes.at(-1)?.image).toEqual({ url: IMAGE.url, alt: null });
  });

  it('renoncer au sélecteur ne change rien', async () => {
    const { form, changes } = setup(emptyInfo(), []);
    form['chooseImage']();
    await Promise.resolve();
    await Promise.resolve();
    expect(changes).toEqual([]);
  });

  it('écrit l’alternative de l’image, et le lien vers un rayon (effaçable)', () => {
    const withImage = { ...emptyInfo(), image: { url: IMAGE.url, alt: null } };
    const { form, changes } = setup(withImage);
    form['setAlt']('Des œufs en chocolat');
    expect(changes.at(-1)?.image).toEqual({ url: IMAGE.url, alt: { fr: 'Des œufs en chocolat' } });
    form['setLink']('choc');
    expect(changes.at(-1)).toMatchObject({ linkShelfKey: 'choc', action: 'shelf' });
  });

  describe('l’action au clic (D11)', () => {
    it('ouvrir une opération retire le rayon lié ; « Aucune » retire les deux', () => {
      const { form, changes } = setup({ ...emptyInfo(), linkShelfKey: 'choc', action: 'shelf' });
      form['pickAction']('operation');
      expect(changes.at(-1)).toMatchObject({ action: 'operation', linkShelfKey: null });
      form['setOperation']('noel-2026');
      expect(changes.at(-1)).toMatchObject({ operationKey: 'noel-2026', action: 'operation' });
      form['pickAction']('none');
      expect(changes.at(-1)).toMatchObject({
        action: 'none',
        linkShelfKey: null,
        operationKey: null,
      });
    });

    it('propose les familles comme rayon, pas le rayon d’une opération', () => {
      const { form } = setup();
      expect(form['shelfOptions']().map((o) => o.value)).toEqual(['all', 'choc']);
    });

    it('nomme les opérations avec leur état, et garde une clé inconnue du catalogue', () => {
      const { form } = setup({ ...emptyInfo(), operationKey: 'paques-2027', action: 'operation' });
      expect(form['operationOptions']()).toEqual([
        { value: 'noel-2026', label: expect.stringContaining('Noël — Commandes closes') },
        { value: 'paques-2027', label: 'paques-2027 — inconnue du catalogue' },
      ]);
    });
  });

  describe('l’héritage d’une annonce liée', () => {
    const linked = { ...emptyInfo(), operationKey: 'noel-2026', action: 'operation' as const };

    it('montre en gris ce que l’opération mettra, dans la langue écrite', () => {
      const { form, fixture } = setup(linked);
      expect(form['inheritedBadge']()).toBe('Commandes closes');
      expect(form['inheritedTitle']()).toBe('Noël');
      form['pickLocale']('en');
      fixture.detectChanges();
      expect(form['inheritedTitle']()).toBe('Christmas');
      // Pas d'anglais pour la phrase : la boutique montrera le français.
      expect(form['inheritedLede']()).toBe('Bûches et papillotes.');
      expect(form['inheritedImage']()?.url).toBe(NOEL.image?.url);
    });

    it('la croix vide le champ dans toutes ses langues : l’opération reprend la main', () => {
      const { form, changes } = setup({
        ...linked,
        title: { fr: 'Les bûches', en: 'Logs' },
        badge: { fr: 'Vite' },
      });
      expect(form['inherits']('title')).toBe(false);
      form['inherit']('title');
      expect(changes.at(-1)?.title).toEqual({ fr: '' });
      form['inherit']('badge');
      expect(changes.at(-1)?.badge).toBeNull();
    });
  });
});

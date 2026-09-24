import { TestBed } from '@angular/core/testing';
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
  { key: 'choc', label: 'Chocolat & confiserie' },
];

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
    expect(changes.at(-1)?.linkShelfKey).toBe('choc');
    form['setLink'](null);
    expect(changes.at(-1)?.linkShelfKey).toBeNull();
  });
});

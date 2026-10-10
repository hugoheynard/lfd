import { TestBed } from '@angular/core/testing';
import type { StorefrontImage } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type { PickedMedia } from '../../pim/catalogue/library-picker/library-picker';
import { StorefrontDoorPanel } from './storefront-door-panel';

const DOOR: StorefrontImage = { url: 'https://media.test/porte.jpg', alt: { fr: 'La porte' } };

/** Le sélecteur de la médiathèque, joué : il rend ce qu'on lui dit de choisir. */
function setup(image: StorefrontImage | null, picked: readonly PickedMedia[] | undefined = []) {
  const opened: unknown[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (_component: unknown, config: { data: unknown }) => {
            opened.push(config.data);
            return { closed: Promise.resolve(picked) };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(StorefrontDoorPanel);
  fixture.componentRef.setInput('image', image);
  const emitted: (StorefrontImage | null)[] = [];
  fixture.componentInstance.changed.subscribe((value) => emitted.push(value));
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const button = (label: string): HTMLButtonElement | undefined =>
    [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  return { fixture, root, emitted, opened, button };
}

describe('StorefrontDoorPanel', () => {
  it('sans photo : un fond uni annoncé, et le choix dans la médiathèque', async () => {
    const picked: PickedMedia[] = [
      {
        url: 'https://media.test/neuve.jpg',
        name: 'neuve.jpg',
        width: 2100,
        height: 900,
        bytes: 1000,
        contentType: 'image/jpeg',
      },
    ];
    const { root, emitted, opened, button } = setup(null, picked);
    expect(root.textContent).toContain('la porte garde un fond uni');
    expect(root.querySelector('img')).toBeNull();
    button('Choisir dans la médiathèque')?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(opened).toEqual([{ already: [], single: true }]);
    // Une image neuve repart sans alternative : celle de l'ancienne ne la décrit pas.
    expect(emitted).toEqual([{ url: 'https://media.test/neuve.jpg', alt: null }]);
  });

  it('avec photo : l’aperçu, son alternative, et « Retirer » rend `null`', () => {
    const { root, emitted, button } = setup(DOOR);
    const img = root.querySelector('img');
    expect(img?.getAttribute('src')).toBe(DOOR.url);
    expect(img?.getAttribute('alt')).toBe('La porte');
    button('Retirer')?.click();
    expect(emitted).toEqual([null]);
  });

  it('écrire l’alternative rend la porte entière ; la vider la rend à `null`', () => {
    const { fixture, emitted } = setup(DOOR);
    const panel = fixture.componentInstance;
    panel['setAlt']('Le comptoir du Labo');
    panel['setAlt']('');
    expect(emitted).toEqual([
      { url: DOOR.url, alt: { fr: 'Le comptoir du Labo' } },
      { url: DOOR.url, alt: null },
    ]);
  });
});

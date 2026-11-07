import { TestBed } from '@angular/core/testing';
import type { ColumnsBlock, FreeBlock } from '@lfd/mail-blocks';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type { PickedMedia } from '../../../pim/catalogue/library-picker/library-picker';

import { type CellAddition, MailBlockSettings } from './mail-block-settings';

function render(block: FreeBlock | ColumnsBlock) {
  const fixture = TestBed.createComponent(MailBlockSettings);
  fixture.componentRef.setInput('block', block);
  fixture.detectChanges();
  return fixture;
}

describe('MailBlockSettings', () => {
  it('règle l’adresse d’un bouton', () => {
    const fixture = render({ id: 'b', kind: 'button', label: { fr: 'Voir' }, href: '' });
    const emitted: FreeBlock[] = [];
    fixture.componentInstance.blockChange.subscribe((next) => emitted.push(next));
    const field: HTMLInputElement = fixture.nativeElement.querySelector('[data-href] input');
    field.value = 'https://lafoliedouce.fr';
    field.dispatchEvent(new Event('input'));
    expect(emitted).toEqual([
      { id: 'b', kind: 'button', label: { fr: 'Voir' }, href: 'https://lafoliedouce.fr' },
    ]);
  });

  it('montre le ton d’un encadré, une largeur par colonne', () => {
    expect(
      render({ id: 'c', kind: 'callout', tone: 'info', text: {} }).nativeElement.querySelector(
        '[data-tone]',
      ),
    ).not.toBeNull();
    const columns = render({ id: 'k', kind: 'columns', widths: [33, 33, 33], cells: [[], [], []] });
    expect(columns.nativeElement.querySelectorAll('[data-width]').length).toBe(3);
  });

  it('ajoute un bloc dans la colonne visée, jamais une mise en page', () => {
    const fixture = render({ id: 'k', kind: 'columns', widths: [50, 50], cells: [[], []] });
    const added: CellAddition[] = [];
    fixture.componentInstance.cellAddition.subscribe((next) => added.push(next));
    expect(fixture.nativeElement.querySelector('[data-library-item="columns-2"]')).toBeNull();
    fixture.nativeElement.querySelector('[data-library-item="heading"]').click();
    expect(added).toEqual([{ cellIndex: 0, key: 'heading' }]);
  });

  describe('une image', () => {
    const IMAGE = { id: 'i', kind: 'image', src: '', alt: { fr: 'Une brioche' } } as const;

    function renderImage(block: FreeBlock, picked: readonly PickedMedia[] | undefined) {
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
      const fixture = render(block);
      const emitted: FreeBlock[] = [];
      fixture.componentInstance.blockChange.subscribe((next) => emitted.push(next));
      return { fixture, emitted, opened, element: fixture.nativeElement as HTMLElement };
    }

    it('choisit dans la médiathèque, une seule image, et n’en garde que l’adresse', async () => {
      const chosen = {
        url: 'https://media.lafoliedouce.fr/a.webp',
        name: 'Brioche',
        width: 800,
        height: 600,
        bytes: 1000,
        contentType: 'image/webp',
        focal: null,
      } as PickedMedia;
      const { element, emitted, opened } = renderImage(IMAGE, [chosen]);
      element.querySelector<HTMLButtonElement>('[data-pick-image]')!.click();
      await Promise.resolve();
      await Promise.resolve();
      expect(opened).toEqual([{ already: [], single: true }]);
      expect(emitted).toEqual([{ ...IMAGE, src: 'https://media.lafoliedouce.fr/a.webp' }]);
    });

    it('renoncer ne change rien', async () => {
      const { element, emitted } = renderImage(IMAGE, undefined);
      element.querySelector<HTMLButtonElement>('[data-pick-image]')!.click();
      await Promise.resolve();
      await Promise.resolve();
      expect(emitted).toEqual([]);
    });

    it('déclarée décorative, elle perd son lien et n’en propose plus', () => {
      const linked = { ...IMAGE, href: 'https://lafoliedouce.fr' };
      const { element, emitted } = renderImage(linked, undefined);
      expect(element.querySelector('[data-image-href]')).not.toBeNull();
      element.querySelector<HTMLInputElement>('[data-decorative] input')!.click();
      expect(emitted).toEqual([{ ...IMAGE, decorative: true }]);
    });

    it('décorative, ne propose pas de lien', () => {
      const { element } = renderImage({ ...IMAGE, decorative: true }, undefined);
      expect(element.querySelector('[data-image-href]')).toBeNull();
    });

    it('pose un lien, et un champ vidé le retire', () => {
      const { element, emitted } = renderImage(IMAGE, undefined);
      const field = element.querySelector<HTMLInputElement>('[data-image-href] input')!;
      field.value = 'https://lafoliedouce.fr';
      field.dispatchEvent(new Event('input'));
      expect(emitted).toEqual([{ ...IMAGE, href: 'https://lafoliedouce.fr' }]);
    });
  });
});

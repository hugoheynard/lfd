import { TestBed } from '@angular/core/testing';
import { modelBlockId, type MailDocument, type MailTemplateDeclaration } from '@lfd/mail-blocks';
import { describe, expect, it } from 'vitest';

import { MailCanvas } from './mail-canvas';

const TEMPLATE = 'customer.order-placed';
const DECLARATION: MailTemplateDeclaration = {
  modelBlocks: ['title', 'footer'],
  locales: ['fr'],
  charter: 'lfc',
};
const DOCUMENT: MailDocument = {
  template: TEMPLATE,
  blocks: [
    { id: modelBlockId('title'), kind: 'model', section: 'title' },
    { id: 'note', kind: 'paragraph', text: { fr: 'Fermé le 1er mai' } },
    { id: modelBlockId('footer'), kind: 'model', section: 'footer' },
  ],
};

function render(document: MailDocument = DOCUMENT) {
  const fixture = TestBed.createComponent(MailCanvas);
  fixture.componentRef.setInput('document', document);
  fixture.componentRef.setInput('declaration', DECLARATION);
  fixture.componentRef.setInput('template', TEMPLATE);
  fixture.componentRef.setInput('locale', 'fr');
  fixture.componentRef.setInput('newId', () => 'neuf');
  fixture.detectChanges();
  const emitted: MailDocument[] = [];
  fixture.componentInstance.documentChange.subscribe((next) => emitted.push(next));
  const element: HTMLElement = fixture.nativeElement;
  return { fixture, emitted, element };
}

function ids(document: MailDocument | undefined): readonly string[] {
  return document?.blocks.map((block) => block.id) ?? [];
}

describe('MailCanvas', () => {
  it('liste les blocs dans l’ordre, ceux du modèle sans bouton pour les retirer', () => {
    const { element } = render();
    const cards = element.querySelectorAll('li[data-block]');
    expect([...cards].map((card) => card.getAttribute('data-block'))).toEqual(ids(DOCUMENT));
    expect(element.querySelector('[data-block="model:title"] [data-remove]')).toBeNull();
    expect(element.querySelector('[data-block="model:title"]')?.textContent).toContain('Titre');
    expect(element.querySelector('[data-block="note"] [data-remove]')).not.toBeNull();
  });

  it('monte et descend un bloc au clavier', () => {
    const { element, emitted } = render();
    element.querySelector<HTMLButtonElement>('[data-block="note"] [data-move-up]')?.click();
    expect(ids(emitted[0])).toEqual(['note', 'model:title', 'model:footer']);
    expect(
      element.querySelector<HTMLButtonElement>('[data-block="model:title"] [data-move-up]')
        ?.disabled,
    ).toBe(true);
  });

  it('ajoute un bloc de la bibliothèque à la fin et ouvre ses réglages', () => {
    const { fixture, element, emitted } = render();
    element.querySelector<HTMLButtonElement>('[data-library-item="button"]')?.click();
    expect(ids(emitted[0])).toEqual([...ids(DOCUMENT), 'neuf']);
    const next = emitted[0];
    if (next !== undefined) {
      fixture.componentRef.setInput('document', next);
    }
    fixture.detectChanges();
    expect(element.querySelector('[data-settings-panel] [data-href]')).not.toBeNull();
  });

  it('retire un bloc libre', () => {
    const { element, emitted } = render();
    element.querySelector<HTMLButtonElement>('[data-block="note"] [data-remove]')?.click();
    expect(ids(emitted[0])).toEqual(['model:title', 'model:footer']);
  });

  it('affiche les refus du paquet, sans en inventer', () => {
    const { element } = render({
      template: TEMPLATE,
      blocks: [
        { id: modelBlockId('title'), kind: 'model', section: 'title' },
        { id: 'b', kind: 'button', label: { fr: 'Voir' }, href: 'http://exemple.fr' },
      ],
    });
    expect(element.querySelector('[data-document-violations]')?.textContent).toContain('Pied');
    expect(element.querySelector('[data-block="b"] [data-block-violation]')?.textContent).toContain(
      'https://',
    );
  });

  it('n’affiche aucun refus pour un document conforme', () => {
    const { element } = render();
    expect(element.querySelector('[data-document-violations], [data-block-violation]')).toBeNull();
  });

  it('ouvre les réglages d’une image posée dans une colonne', () => {
    const { fixture, element } = render({
      template: TEMPLATE,
      blocks: [
        { id: modelBlockId('title'), kind: 'model', section: 'title' },
        {
          id: 'k',
          kind: 'columns',
          widths: [50, 50],
          cells: [[{ id: 'img', kind: 'image', src: '', alt: {} }], []],
        },
        { id: modelBlockId('footer'), kind: 'model', section: 'footer' },
      ],
    });
    element.querySelector<HTMLButtonElement>('[data-block="img"] [data-settings]')!.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-settings-panel] [data-pick-image]')).not.toBeNull();
  });

  it('sélectionne un bloc du modèle ou un cadre pour lire ses phrases, et le relâche', () => {
    const { fixture, element } = render();
    const canvas = fixture.componentInstance;
    element.querySelector<HTMLButtonElement>('[data-block="model:title"] [data-focus]')?.click();
    expect(canvas.focus()).toEqual({ kind: 'block', block: 'title' });
    element.querySelector<HTMLButtonElement>('[data-frame="subject"] [data-focus]')?.click();
    expect(canvas.focus()).toEqual({ kind: 'frame', frame: 'subject' });
    element.querySelector<HTMLButtonElement>('[data-frame="subject"] [data-focus]')?.click();
    expect(canvas.focus()).toBeNull();
    expect(element.querySelector('[data-block="note"] [data-focus]')).toBeNull();
  });
});

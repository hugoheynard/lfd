import { TestBed } from '@angular/core/testing';
import {
  modelBlockId,
  type MailDocument,
  type MailDocumentBlockPreviewView,
  type MailEditorPhraseView,
  type MailTemplateDeclaration,
} from '@lfd/mail-blocks';
import { describe, expect, it, vi } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { MailEditorService } from '../../data/mail-editor.service';
import { MailBlockPreviewsStore } from '../../state/mail-block-previews-store';
import { MailPhrasesStore } from '../../state/mail-phrases-store';
import { MailCanvas } from './mail-canvas';

const TEMPLATE = 'customer.order-ready';
const DECLARATION: MailTemplateDeclaration = {
  modelBlocks: ['title', 'footer'],
  locales: ['fr', 'en'],
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

function phrase(path: string, variables: readonly string[] = []): MailEditorPhraseView {
  const locale = {
    default: `Texte ${path}`,
    draftState: 'unchanged',
    draftText: null,
    publishedText: null,
    revision: 0,
    defaultChangedSince: null,
  } as const;
  return {
    path,
    variables,
    requiredVariables: variables,
    place: { kind: 'block', block: 'title' },
    variant: null,
    staleTranslations: [],
    locales: { fr: locale, en: locale, it: locale },
  };
}

function rendered(blocks: Record<string, string>): MailDocumentBlockPreviewView {
  return {
    template: TEMPLATE,
    locale: 'en',
    subject: '<span data-phrase="subject">Commande <span data-var="ref">EX-1</span> prête</span>',
    header: '<table role="presentation"><tr><td>LFC</td></tr></table>',
    footer: '',
    blocks: Object.entries(blocks).map(([blockId, html]) => ({ blockId, html })),
  };
}

const FRAGMENTS = {
  'model:title': '<h1><span data-phrase="title.ready">Votre commande est prête</span></h1>',
  note: '<p><span data-free-block="note" data-locale="en">Closed on May 1st</span></p>',
  'model:footer': '<p>Merci</p>',
};

function render(document: MailDocument = DOCUMENT, fragments: Record<string, string> = FRAGMENTS) {
  TestBed.configureTestingModule({
    providers: [
      MailPhrasesStore,
      MailBlockPreviewsStore,
      { provide: MailEditorService, useValue: {} },
      { provide: NotifyService, useValue: { error: vi.fn(), success: vi.fn() } },
    ],
  });
  const phrases = TestBed.inject(MailPhrasesStore);
  phrases.use(TEMPLATE, [phrase('subject', ['ref']), phrase('title.ready')]);
  const previews = TestBed.inject(MailBlockPreviewsStore);
  previews.view.set(rendered(fragments));
  const fixture = TestBed.createComponent(MailCanvas);
  fixture.componentRef.setInput('document', document);
  fixture.componentRef.setInput('declaration', DECLARATION);
  fixture.componentRef.setInput('template', TEMPLATE);
  fixture.componentRef.setInput('locale', 'fr');
  fixture.componentRef.setInput('canWrite', true);
  fixture.componentRef.setInput('newId', () => 'neuf');
  fixture.detectChanges();
  const emitted: MailDocument[] = [];
  fixture.componentInstance.documentChange.subscribe((next) => emitted.push(next));
  const element: HTMLElement = fixture.nativeElement;
  globalThis.document.body.append(element);
  return { fixture, emitted, element, phrases, previews };
}

function ids(document: MailDocument | undefined): readonly string[] {
  return document?.blocks.map((block) => block.id) ?? [];
}

describe('MailCanvas — l’e-mail lui-même', () => {
  it('compose l’e-mail des fragments du serveur, dans l’ordre du document', () => {
    const { element } = render();
    const blocks = element.querySelectorAll('li[data-block]');
    expect([...blocks].map((block) => block.getAttribute('data-block'))).toEqual(ids(DOCUMENT));
    expect(element.querySelector('[data-mail]')?.textContent).toContain('Votre commande est prête');
    expect(element.querySelector('[data-frame="header"]')?.textContent).toContain('LFC');
    expect(element.querySelector('[data-block="model:title"]')?.textContent).toContain(
      'Titre · du modèle',
    );
    expect(element.querySelector('[data-block="model:title"] [data-remove]')).toBeNull();
    expect(element.querySelector('[data-block="note"] [data-remove]')).not.toBeNull();
    expect(element.querySelector('[data-block="note"]')?.getAttribute('tabindex')).toBe('0');
    element.remove();
  });

  it('montre l’objet, écrit sur place, dans la colonne de gauche', () => {
    const { element } = render();
    const subject = element.querySelector('[data-left] [data-phrase="subject"]');
    expect(subject?.getAttribute('contenteditable')).toBe('plaintext-only');
    element.remove();
  });

  it('monte un bloc au bouton, et le descend au clavier (Alt + flèche)', () => {
    const { element, emitted } = render();
    element.querySelector<HTMLButtonElement>('[data-block="note"] [data-move-up]')?.click();
    expect(ids(emitted[0])).toEqual(['note', 'model:title', 'model:footer']);
    element
      .querySelector('li[data-block="note"]')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
      );
    expect(ids(emitted[1])).toEqual(['model:title', 'model:footer', 'note']);
    element.remove();
  });

  it('ajoute un bloc de la bibliothèque sous le bloc sélectionné, et ouvre ses réglages', () => {
    const { element, emitted, fixture } = render();
    element.querySelector<HTMLElement>('li[data-block="model:title"]')?.click();
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-library-item="button"]')?.click();
    expect(ids(emitted[0])).toEqual(['model:title', 'neuf', 'note', 'model:footer']);
    fixture.componentRef.setInput('document', emitted[0]);
    fixture.detectChanges();
    expect(element.querySelector('[data-settings-panel]')).not.toBeNull();
    element.remove();
  });

  it('une phrase écrite sur place part en brouillon dans la langue RENDUE', () => {
    const { element, phrases } = render();
    const edit = vi.spyOn(phrases, 'edit');
    const zone = element.querySelector('[data-phrase="title.ready"]');
    if (zone !== null) {
      zone.textContent = 'Elle est prête';
    }
    zone?.dispatchEvent(new Event('input', { bubbles: true }));
    expect(edit).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'title.ready' }),
      'en',
      'Elle est prête',
    );
    element.remove();
  });

  it('le texte d’un bloc libre écrit sur place change le document, dans sa langue', () => {
    const { element, emitted } = render();
    const zone = element.querySelector('[data-free-block="note"]');
    if (zone !== null) {
      zone.textContent = 'Closed on May 8th';
    }
    zone?.dispatchEvent(new Event('input', { bubbles: true }));
    expect(emitted[0]?.blocks[1]).toEqual({
      id: 'note',
      kind: 'paragraph',
      text: { fr: 'Fermé le 1er mai', en: 'Closed on May 8th' },
    });
    element.remove();
  });

  it('un bloc libre que le serveur ne rend pas encore garde une zone où écrire', () => {
    const empty: MailDocument = {
      ...DOCUMENT,
      blocks: [...DOCUMENT.blocks, { id: 'vide', kind: 'heading', text: {} }],
    };
    const { element } = render(empty, { ...FRAGMENTS, vide: '' });
    expect(
      element
        .querySelector('[data-block="vide"] [data-free-block="vide"]')
        ?.getAttribute('contenteditable'),
    ).toBe('plaintext-only');
    element.remove();
  });

  it('affiche sous le bloc le refus du serveur sur une de ses phrases', () => {
    const { element, phrases, fixture } = render();
    phrases.refusals.set(new Map([['title.ready\u0000en', 'La variable {ref} est obligatoire.']]));
    fixture.detectChanges();
    expect(
      element.querySelector('[data-block="model:title"] [data-phrase-refusal]')?.textContent,
    ).toContain('{ref} est obligatoire');
    element.remove();
  });

  it('une variable choisie au clavier s’insère en pastille au curseur de la phrase', () => {
    const { element, phrases, fixture } = render();
    const edit = vi.spyOn(phrases, 'edit');
    const zone = element.querySelector('[data-phrase="title.ready"]');
    const text = zone?.firstChild;
    if (text === null || text === undefined) {
      throw new Error('zone sans texte');
    }
    const range = document.createRange();
    range.setStart(text, 'Votre commande'.length);
    range.collapse(true);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-variable="ref"]')?.click();
    expect(edit).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'title.ready' }),
      'en',
      'Votre commande{ref} est prête',
    );
    element.remove();
  });

  it('sans rendu, attend ; sur un échec, le dit et propose de réessayer', () => {
    const { element, previews, fixture } = render();
    previews.view.set(null);
    fixture.detectChanges();
    expect(element.querySelector('fold-loading')).not.toBeNull();
    previews.error.set('Cas inconnu.');
    fixture.detectChanges();
    expect(element.querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
    element.remove();
  });
});

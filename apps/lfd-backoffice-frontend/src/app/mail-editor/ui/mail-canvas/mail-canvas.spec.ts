import { TestBed } from '@angular/core/testing';
import {
  modelBlockId,
  type MailDocument,
  type MailDocumentBlockPreviewView,
  type MailEditorResources,
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

const RESOURCES: MailEditorResources = {
  values: [
    {
      name: 'ref',
      label: 'Référence de commande',
      description: 'le numéro de la commande',
      example: 'ORD-4812',
      phrases: ['subject', 'title.ready'],
    },
    {
      name: 'day',
      label: 'Jour de retrait',
      description: 'le jour où la commande attend',
      example: 'vendredi 8 mai',
      phrases: ['subject'],
    },
  ],
  links: [
    {
      slot: 'cta',
      label: 'Liste de ses commandes',
      description: 'la liste de ses commandes, sur la boutique',
    },
  ],
  dataBlocks: [
    { block: 'summary', label: 'Récapitulatif de la commande', description: 'les lignes' },
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
  fixture.componentRef.setInput('resources', RESOURCES);
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

  it('poignée toujours nommée avec le geste clavier, et plus de boutons monter / descendre', () => {
    const { element } = render();
    const handle = element.querySelector('[data-block="note"] [data-handle]');
    expect(handle?.getAttribute('aria-label')).toContain('Alt + flèche');
    expect(element.querySelector('[data-block="model:title"] [data-handle]')).not.toBeNull();
    expect(element.querySelector('[data-move-up], [data-move-down]')).toBeNull();
    element.remove();
  });

  it('Alt + flèche déplace le bloc focalisé', () => {
    const { element, emitted } = render();
    const note = element.querySelector('li[data-block="note"]');
    note?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }),
    );
    expect(ids(emitted[0])).toEqual(['note', 'model:title', 'model:footer']);
    note?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
    );
    expect(ids(emitted[1])).toEqual(['model:title', 'model:footer', 'note']);
    element.remove();
  });

  it('la croix retire un bloc libre, et « Annuler » le remet', () => {
    const { fixture, element, emitted } = render();
    element.querySelector<HTMLButtonElement>('[data-block="note"] [data-remove]')?.click();
    expect(ids(emitted[0])).toEqual(['model:title', 'model:footer']);
    fixture.componentRef.setInput('document', emitted[0]);
    fixture.detectChanges();
    expect(element.querySelector('[data-removal]')?.textContent).toContain('Paragraphe');
    element.querySelector<HTMLButtonElement>('[data-undo-removal]')?.click();
    expect(emitted[1]).toBe(DOCUMENT);
    fixture.detectChanges();
    expect(element.querySelector('[data-removal]')).toBeNull();
    element.remove();
  });

  it('sans liste de phrases éditables, tout s’écrit ; avec, seules les siennes', () => {
    const { fixture, element } = render();
    fixture.componentRef.setInput('declaration', { ...DECLARATION, editablePhrases: ['subject'] });
    fixture.detectChanges();
    expect(
      element.querySelector('[data-phrase="title.ready"]')?.hasAttribute('contenteditable'),
    ).toBe(false);
    expect(
      element.querySelector('[data-left] [data-phrase="subject"]')?.getAttribute('contenteditable'),
    ).toBe('plaintext-only');
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
    element.querySelector<HTMLButtonElement>('[data-value="ref"]')?.click();
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

  it('le bouton du modèle porte sa pastille de lien, et plus de carte « Lien automatique »', () => {
    const withCta: MailDocument = {
      template: TEMPLATE,
      blocks: [{ id: modelBlockId('cta'), kind: 'model', section: 'cta' }],
    };
    const { element, fixture } = render(withCta, { 'model:cta': '<p>Voir</p>' });
    const chip = element.querySelector('[data-block="model:cta"] [data-link-chip="cta"]');
    expect(chip?.textContent).toContain('Liste de ses commandes');
    expect(chip?.getAttribute('title')).toBe('la liste de ses commandes, sur la boutique');
    element.querySelector<HTMLElement>('li[data-block="model:cta"]')?.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-cta-destination]')).toBeNull();
    expect(element.querySelector('[data-right]')?.textContent).not.toContain('Lien automatique');
    element.remove();
  });

  it('une valeur choisie pour une phrase qui ne la reçoit pas est refusée, et le refus est dit', () => {
    const { element, phrases, fixture } = render();
    const edit = vi.spyOn(phrases, 'edit');
    const text = element.querySelector('[data-phrase="title.ready"]')?.firstChild;
    if (text === null || text === undefined) {
      throw new Error('zone sans texte');
    }
    const range = document.createRange();
    range.setStart(text, 0);
    range.collapse(true);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    element.querySelector<HTMLButtonElement>('[data-value="day"]')?.click();
    fixture.detectChanges();
    expect(edit).not.toHaveBeenCalled();
    expect(element.querySelector('[data-value-refusal]')?.textContent).toContain(
      '« Jour de retrait » ne peut pas aller dans cette phrase',
    );
    element.remove();
  });

  it('l’objet montre ses pastilles au nom lisible de leur fiche', () => {
    const { element } = render();
    const chip = element.querySelector('[data-left] [data-var="ref"]');
    expect(chip?.textContent).toBe('Référence de commande');
    expect(chip?.getAttribute('title')).toContain('EX-1');
    element.remove();
  });

  it('survoler un bloc de données à gauche éclaire le bloc dans l’e-mail', () => {
    const withSummary: MailDocument = {
      template: TEMPLATE,
      blocks: [{ id: modelBlockId('summary'), kind: 'model', section: 'summary' }],
    };
    const { element, fixture } = render(withSummary, { 'model:summary': '<p>Lignes</p>' });
    element.querySelector('[data-data-block="summary"]')?.dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();
    expect(element.querySelector('li[data-block="model:summary"]')?.classList).toContain('lit');
    element.remove();
  });

  it('un bouton ajouté montre son adresse dans une pastille de lien qui ouvre ses réglages', () => {
    const buttons: MailDocument = {
      template: TEMPLATE,
      blocks: [
        { id: 'b1', kind: 'button', label: { fr: 'Voir' }, href: 'https://exemple.fr/a' },
        { id: 'b2', kind: 'button', label: { fr: 'Voir' }, href: '' },
      ],
    };
    const { element, fixture } = render(buttons, { b1: '<p>Voir</p>', b2: '<p>Voir</p>' });
    expect(element.querySelector('[data-block="b1"] [data-button-href]')?.textContent).toContain(
      'https://exemple.fr/a',
    );
    expect(element.querySelector('[data-block="b2"] [data-button-href]')?.textContent).toContain(
      'pas encore d’adresse',
    );
    expect(element.querySelector('[data-settings-panel]')).toBeNull();
    element.querySelector<HTMLButtonElement>('[data-block="b2"] [data-button-href]')?.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-settings-panel]')).not.toBeNull();
    element.remove();
  });
  describe('conditions d’affichage (§ 24)', () => {
    const CONDITION = 'Seulement pour un retrait ; absent pour une livraison.';
    const WITH_ITINERARY: MailDocument = {
      template: TEMPLATE,
      blocks: [
        { id: modelBlockId('summary'), kind: 'model', section: 'summary' },
        { id: modelBlockId('itinerary'), kind: 'model', section: 'itinerary' },
      ],
    };
    const CONDITIONED: MailEditorResources = {
      ...RESOURCES,
      dataBlocks: [
        ...RESOURCES.dataBlocks,
        { block: 'itinerary', label: 'Itinéraire', description: 'le point', condition: CONDITION },
      ],
    };

    it('un bloc sous condition porte son badge et sa condition entière, sur le bloc et sa fiche', () => {
      const { element, fixture } = render(WITH_ITINERARY, {
        'model:summary': '<p>Lignes</p>',
        'model:itinerary': '<p>Rue</p>',
      });
      fixture.componentRef.setInput('resources', CONDITIONED);
      fixture.detectChanges();
      const chip = element.querySelector('li[data-block="model:itinerary"] [data-condition]');
      expect(chip?.textContent).toContain('Sous condition');
      expect(chip?.getAttribute('title')).toBe(CONDITION);
      expect(
        element.querySelector('li[data-block="model:itinerary"] [data-condition-text]')
          ?.textContent,
      ).toContain(CONDITION);
      expect(element.querySelector('li[data-block="model:summary"] [data-condition]')).toBeNull();
      expect(
        element.querySelector('[data-data-block="itinerary"] [data-condition]')?.textContent,
      ).toContain(CONDITION);
      element.remove();
    });

    it('un bloc absent dans la situation rendue reste là, grisé, et dit pourquoi', () => {
      const { element, fixture, previews } = render(WITH_ITINERARY, {
        'model:summary': '<p>Lignes</p>',
        'model:itinerary': '',
      });
      fixture.componentRef.setInput('resources', CONDITIONED);
      previews.view.set({
        ...rendered({ 'model:summary': '<p>Lignes</p>', 'model:itinerary': '' }),
        situation: 'delivery',
      });
      fixture.detectChanges();
      const block = element.querySelector('li[data-block="model:itinerary"]');
      expect(block?.classList).toContain('absent');
      expect(block?.querySelector('[data-absent]')?.textContent).toContain(
        'Absent pour une livraison',
      );
      expect(block?.querySelector('[data-handle]')).not.toBeNull();
      expect(element.querySelector('li[data-block="model:summary"]')?.classList).not.toContain(
        'absent',
      );
      element.remove();
    });

    it('sans situation, un fragment vide n’est pas une absence', () => {
      const { element, fixture } = render(WITH_ITINERARY, {
        'model:summary': '<p>Lignes</p>',
        'model:itinerary': '',
      });
      fixture.componentRef.setInput('resources', CONDITIONED);
      fixture.detectChanges();
      expect(element.querySelector('[data-absent]')).toBeNull();
      expect(element.querySelector('[data-nothing-shown]')).not.toBeNull();
      element.remove();
    });
  });

  /**
   * Régression : `violationsOf` ne lisait que le niveau du dessus — le refus
   * d'un bloc rangé dans une colonne ne s'affichait nulle part (2026-11-07).
   */
  it('le refus d’un bloc en colonne s’affiche sous sa mise en page, colonne et bloc nommés', () => {
    const columns: MailDocument = {
      template: TEMPLATE,
      blocks: [
        {
          id: 'cols',
          kind: 'columns',
          widths: [50, 50],
          cells: [[], [{ id: 'btn', kind: 'button', label: { fr: 'Voir' }, href: 'http://x.fr' }]],
        },
      ],
    };
    const { element } = render(columns, { cols: '<table></table>' });
    const refusal = element.querySelector('li[data-block="cols"] [data-block-violation]');
    expect(refusal?.textContent).toContain('Colonne 2 · Bouton');
    expect(refusal?.textContent).toContain('https://');
    expect(element.querySelector('[data-document-violations]')?.textContent ?? '').not.toContain(
      'https://',
    );
    element.remove();
  });
});

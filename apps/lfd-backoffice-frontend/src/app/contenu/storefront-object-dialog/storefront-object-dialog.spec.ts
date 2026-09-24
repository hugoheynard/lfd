import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type { EditorBlock } from '../storefront-block';
import type { StorefrontObjectHost } from '../storefront-object-host';
import type { TemplateLabel } from '../storefront-templates';
import { StorefrontObjectDialog } from './storefront-object-dialog';

/**
 * Le dialogue ne tient pas l'objet, il le lit chez l'éditeur. Ce qu'on tient
 * ici : l'aperçu bureau et mobile à la taille de la forme, la fermeture, et le
 * gabarit qui ne se ferme que si l'éditeur accepte le nom. L'aller-retour avec
 * la vraie composition est éprouvé dans `storefront-page.spec.ts`.
 */
const HERO: EditorBlock = { id: 'h', format: 'hero', column: 1, row: 1, shelves: ['all'] };

function setup(block: EditorBlock | null = HERO, accept = true) {
  const closes: unknown[] = [];
  const named: TemplateLabel[] = [];
  const host: StorefrontObjectHost = {
    selected: signal(block),
    shelf: signal('all'),
    shelves: signal([{ key: 'all', label: 'Tout' }]),
    catalog: signal(null),
    notice: signal(null),
    setSelectedApplyOnMobile: () => undefined,
    setSelectedMedia: () => undefined,
    setSelectedFormat: () => undefined,
    setSelectedTone: () => undefined,
    setSelectedContents: () => undefined,
    setSelectedCarousel: () => undefined,
    setSelectedShelves: () => undefined,
    setSelectedItems: () => undefined,
    saveSelectedAsTemplate: (label) => {
      named.push(label);
      return accept;
    },
  };
  TestBed.configureTestingModule({
    providers: [{ provide: FoldPanelRef, useValue: { close: () => closes.push('closed') } }],
  });
  const fixture = TestBed.createComponent(StorefrontObjectDialog);
  fixture.componentRef.setInput('data', { host });
  fixture.detectChanges();
  return {
    fixture,
    dialog: fixture.componentInstance,
    root: fixture.nativeElement as HTMLElement,
    closes,
    named,
  };
}

describe('StorefrontObjectDialog', () => {
  it('montre l’objet à sa taille : 3×2 au bureau, 2×2 en mobile', () => {
    const { root } = setup();
    const captions = Array.from(root.querySelectorAll('.previews .caption')).map((c) =>
      c.textContent?.trim(),
    );
    expect(captions).toEqual(['Bureau · 3×2', 'Mobile · 2×2']);
    expect(root.querySelectorAll('.previews app-storefront-media-mock')).toHaveLength(2);
  });

  it('« Fermer » ferme le dialogue', () => {
    const { root, closes } = setup();
    const close = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Fermer',
    );
    close?.click();
    expect(closes).toEqual(['closed']);
  });

  it('le gabarit ne se referme que si l’éditeur accepte le nom', () => {
    const refused = setup(HERO, false);
    refused.dialog['naming'].set(true);
    refused.dialog['saveTemplate']({ name: 'A', description: '' });
    expect(refused.dialog['naming']()).toBe(true);
    TestBed.resetTestingModule();
    const accepted = setup(HERO, true);
    accepted.dialog['naming'].set(true);
    accepted.dialog['saveTemplate']({ name: 'A', description: '' });
    expect(accepted.dialog['naming']()).toBe(false);
    expect(accepted.named).toEqual([{ name: 'A', description: '' }]);
  });

  it('un objet retiré entre-temps : le dialogue le dit, sans réglages', () => {
    const { root } = setup(null);
    expect(root.querySelector('fold-empty-state')).not.toBeNull();
    expect(root.querySelector('app-storefront-object-panel')).toBeNull();
  });
});

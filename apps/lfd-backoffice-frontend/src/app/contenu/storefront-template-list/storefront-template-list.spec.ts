import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { StorefrontTemplate } from '../storefront-templates';
import { StorefrontTemplateList } from './storefront-template-list';

const noel: StorefrontTemplate = { id: 'g1', name: 'Noël', format: 'tile' };

function setup(templates: readonly StorefrontTemplate[], accept = true) {
  const fixture = TestBed.createComponent(StorefrontTemplateList);
  const renames: [string, unknown][] = [];
  fixture.componentRef.setInput('templates', templates);
  fixture.componentRef.setInput('rename', (id: string, label: unknown) => {
    renames.push([id, label]);
    return accept;
  });
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement, renames };
}

describe('StorefrontTemplateList', () => {
  it('liste vide : un état vide fold', () => {
    const { root } = setup([]);
    expect(root.querySelector('fold-empty-state')).not.toBeNull();
  });

  it('montre chaque gabarit avec sa forme, et Entrée le pose', () => {
    const { fixture, root } = setup([noel]);
    const added: StorefrontTemplate[] = [];
    fixture.componentInstance.added.subscribe((t) => added.push(t));
    const button = root.querySelector('button.draggable');
    expect(button?.textContent).toContain('Noël · Tuile 2×1');
    button?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(added).toEqual([noel]);
  });

  it('le renommage ne se ferme que si le parent l’accepte', () => {
    const refused = setup([noel], false);
    refused.fixture.componentInstance['editingId'].set('g1');
    refused.fixture.detectChanges();
    refused.root.querySelector('form')?.dispatchEvent(new Event('submit'));
    refused.fixture.detectChanges();
    expect(refused.renames).toEqual([['g1', { name: 'Noël', description: '' }]]);
    expect(refused.root.querySelector('app-template-name-form')).not.toBeNull();

    const accepted = setup([noel], true);
    accepted.fixture.componentInstance['editingId'].set('g1');
    accepted.fixture.detectChanges();
    accepted.root.querySelector('form')?.dispatchEvent(new Event('submit'));
    accepted.fixture.detectChanges();
    expect(accepted.root.querySelector('app-template-name-form')).toBeNull();
  });

  it('la description paraît sous le nom, entière dans le title', () => {
    const long = 'Une description assez longue pour être tronquée à deux lignes dans la palette.';
    const { root } = setup([{ ...noel, description: long }]);
    const description = root.querySelector('.description');
    expect(description?.textContent).toContain(long);
    expect(description?.getAttribute('title')).toBe(long);
  });
});

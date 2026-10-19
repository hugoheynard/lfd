import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';

import { BundleChoiceSearch } from '../bundle-choice-search/bundle-choice-search';
import { type GroupDraft, groupsOf } from '../bundle-draft';
import { bundleChoice, bundleGroup, bundleView } from '../bundle.testing';
import { BundlesService } from '../bundles.service';
import { BundleCompositionEditor } from './bundle-composition-editor';

@Component({
  imports: [BundleCompositionEditor],
  template: `<app-bundle-composition-editor [(groups)]="groups" [locked]="locked()" />`,
})
class Host {
  readonly groups = signal<readonly GroupDraft[]>(groupsOf(bundleView()));
  readonly locked = signal(false);
}

function setup(locked = false) {
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [{ provide: BundlesService, useValue: { searchChoices: async () => [] } }],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.locked.set(locked);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const click = (tooltip: string, nth = 0) => {
    const host = root.querySelectorAll(`fold-button-icon[tooltip="${tooltip}"]`)[nth];
    host?.querySelector('button')?.click();
    fixture.detectChanges();
  };
  const labels = () => fixture.componentInstance.groups().map((g) => g.label);
  const skus = (index: number) =>
    fixture.componentInstance.groups()[index]?.choices.map((c) => c.sku);
  return { fixture, root, click, labels, skus };
}

describe('BundleCompositionEditor', () => {
  it('ajoute un groupe neuf, sans clé, en fin de liste', () => {
    const { fixture, root } = setup();
    [...root.querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Ajouter un groupe'))
      ?.click();
    fixture.detectChanges();
    const groups = fixture.componentInstance.groups();
    expect(groups).toHaveLength(3);
    expect(groups[2]?.key).toBeNull();
  });

  it('renomme un groupe par son champ, en gardant sa clé', () => {
    const { fixture, root } = setup();
    const input = root.querySelector('fold-input input') as HTMLInputElement;
    input.value = 'Boissons chaudes';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.groups()[0]).toMatchObject({
      key: 'boisson',
      label: 'Boissons chaudes',
    });
  });

  it('réordonne et retire les groupes', () => {
    const { click, labels } = setup();
    click('Descendre le groupe', 0);
    expect(labels()).toEqual(['Viennoiserie', 'Boisson']);
    click('Retirer le groupe', 0);
    expect(labels()).toEqual(['Boisson']);
  });

  it('réordonne et retire les articles d’un groupe', () => {
    const { fixture, click, skus } = setup();
    fixture.componentInstance.groups.set(
      groupsOf(
        bundleView({
          groups: [bundleGroup({ choices: [bundleChoice(), bundleChoice({ sku: 'THE-1' })] })],
        }),
      ),
    );
    fixture.detectChanges();
    click('Descendre', 0);
    expect(skus(0)).toEqual(['THE-1', 'CAFE-1']);
    click('Retirer du groupe', 1);
    expect(skus(0)).toEqual(['THE-1']);
  });

  it('ajoute au groupe l’article choisi dans la recherche', () => {
    const { fixture, skus } = setup();
    const search = fixture.debugElement.queryAll(By.directive(BundleChoiceSearch))[1]
      ?.componentInstance as BundleChoiceSearch;
    search.picked.emit({
      sku: 'PAIN-1',
      name: 'Pain au chocolat',
      shelf: 'Viennoiseries',
      thumbnailUrl: null,
    });
    fixture.detectChanges();
    expect(skus(1)).toEqual(['CROI-1', 'PAIN-1']);
    expect(fixture.componentInstance.groups()[1]?.choices[1]?.standing).toBe('admissible');
  });

  it('marque un article non admissible de sa raison', () => {
    const { fixture, root } = setup();
    fixture.componentInstance.groups.set(
      groupsOf(
        bundleView({
          groups: [bundleGroup({ choices: [bundleChoice({ standing: 'not_served_to_public' })] })],
        }),
      ),
    );
    fixture.detectChanges();
    expect(root.querySelector('fold-badge')?.textContent).toContain('Plus servi au public');
  });

  it('verrouillé : ni bouton, ni recherche', () => {
    const { root } = setup(true);
    expect(root.querySelector('fold-button-icon')).toBeNull();
    expect(root.querySelector('app-bundle-choice-search')).toBeNull();
    expect(root.textContent).not.toContain('Ajouter un groupe');
  });
});

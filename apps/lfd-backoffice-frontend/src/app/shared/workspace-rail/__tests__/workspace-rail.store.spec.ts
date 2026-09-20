import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import {
  WorkspaceRailStore,
  provideWorkspaceRail,
  type WorkspaceRail,
} from '../workspace-rail.store';

const PIM: WorkspaceRail = {
  title: 'PIM',
  icon: 'catalog',
  items: [{ key: 'produits', label: 'Produits', link: '/pim/produits', icon: 'product' }],
};

/** Une page d'espace de travail : elle publie son rail tant qu'elle vit. */
@Component({ standalone: true, template: '' })
class WorkspacePage {
  readonly rail = signal<WorkspaceRail>(PIM);

  constructor() {
    provideWorkspaceRail(this.rail);
  }
}

describe('provideWorkspaceRail', () => {
  it("publie le rail de l'espace ouvert", () => {
    const fixture = TestBed.createComponent(WorkspacePage);
    fixture.detectChanges();

    expect(TestBed.inject(WorkspaceRailStore).rail()?.title).toBe('PIM');
  });

  it('suit le signal — les droits peuvent retirer une vue en cours de route', () => {
    const fixture = TestBed.createComponent(WorkspacePage);
    fixture.detectChanges();

    fixture.componentInstance.rail.set({ ...PIM, items: [] });
    fixture.detectChanges();

    expect(TestBed.inject(WorkspaceRailStore).rail()?.items).toEqual([]);
  });

  it("efface le rail quand on quitte l'espace", () => {
    // Sans cela, le rail du PIM resterait affiché à côté du tableau de bord —
    // sept vues d'un contexte qu'on vient justement de quitter.
    const store = TestBed.inject(WorkspaceRailStore);
    const fixture = TestBed.createComponent(WorkspacePage);
    fixture.detectChanges();
    expect(store.rail()).not.toBeNull();

    fixture.destroy();

    expect(store.rail()).toBeNull();
  });
});

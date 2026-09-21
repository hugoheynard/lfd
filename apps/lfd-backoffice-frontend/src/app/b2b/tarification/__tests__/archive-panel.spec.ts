import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { PriceScopePayload } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { ArchivePanel, type ArchivePanelData } from '../archive-panel/archive-panel';
import { TarificationService } from '../tarification.service';

/**
 * **Le panneau qui demande pourquoi.**
 *
 * Trois choses à garantir : le motif part tel qu'il est écrit, un champ vide
 * vaut « pas de motif » (et non une chaîne vide en base), et une limite
 * s'archive par sa **portée** là où une règle s'archive par son identifiant.
 */

interface Archived {
  readonly kind: 'rule' | 'floor';
  readonly key: string;
  readonly reason: string | null;
}

const RULE: ArchivePanelData = {
  subject: { kind: 'rule', id: 'rule_1' },
  target: 'Promo de rentrée',
  summary: 'Promotion −10 % — Promo de rentrée',
};

const FLOOR: ArchivePanelData = {
  subject: { kind: 'floor', scope: { type: 'category', id: 'viennoiserie' } },
  target: 'Viennoiseries',
  summary: 'mur à 1,50 €',
};

function mount(
  data: ArchivePanelData,
  archived: Archived[],
  closed: boolean[],
): ComponentFixture<ArchivePanel> {
  const service: Pick<TarificationService, 'archiveRule' | 'archiveFloor'> = {
    archiveRule: (id, reason) => {
      archived.push({ kind: 'rule', key: id, reason });
      return Promise.resolve();
    },
    archiveFloor: (scope: PriceScopePayload, reason) => {
      archived.push({ kind: 'floor', key: `${scope.type}:${scope.id ?? ''}`, reason });
      return Promise.resolve();
    },
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: TarificationService, useValue: service },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      {
        provide: FoldPanelRef,
        useValue: { close: (value?: boolean) => closed.push(value ?? false) },
      },
    ],
  });
  const fixture = TestBed.createComponent(ArchivePanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture;
}

describe('archiver en disant pourquoi', () => {
  it('transmet le motif écrit', async () => {
    const archived: Archived[] = [];
    const fixture = mount(RULE, archived, []);
    fixture.componentInstance['reason'].set('Remplacée par la promo de rentrée');

    await fixture.componentInstance['submit']();

    expect(archived).toEqual([
      { kind: 'rule', key: 'rule_1', reason: 'Remplacée par la promo de rentrée' },
    ]);
  });

  /**
   * Un champ vide vaut **pas de motif**. Écrire `''` en base ferait passer une
   * absence pour une réponse, et le journal citerait des guillemets vides.
   */
  it("rend null quand rien n'est écrit, jamais une chaîne vide", async () => {
    const archived: Archived[] = [];
    const fixture = mount(RULE, archived, []);
    fixture.componentInstance['reason'].set('   ');

    await fixture.componentInstance['submit']();

    expect(archived[0]?.reason).toBeNull();
  });

  /** Une limite n'a pas d'identifiant à transporter : elle se désigne par sa portée. */
  it('archive une limite par sa portée', async () => {
    const archived: Archived[] = [];

    await mount(FLOOR, archived, [])
      .componentInstance['submit']()
      .then(() => undefined);

    expect(archived).toEqual([{ kind: 'floor', key: 'category:viennoiserie', reason: null }]);
  });

  it('referme en signalant que quelque chose a changé', async () => {
    const closed: boolean[] = [];

    await mount(RULE, [], closed).componentInstance['submit']();

    expect(closed).toEqual([true]);
  });

  /** Annuler ne doit RIEN archiver — c'est le seul geste sans conséquence ici. */
  it("n'archive rien quand on annule", () => {
    const archived: Archived[] = [];
    const closed: boolean[] = [];

    mount(RULE, archived, closed).componentInstance['cancel']();

    expect(archived).toEqual([]);
    expect(closed).toEqual([false]);
  });

  /** Ce qu'on range doit être sous les yeux pendant qu'on l'explique. */
  it("montre la décision qu'on archive", () => {
    const text = mount(RULE, [], []).nativeElement.textContent ?? '';

    expect(text).toContain('Promotion −10 %');
  });
});

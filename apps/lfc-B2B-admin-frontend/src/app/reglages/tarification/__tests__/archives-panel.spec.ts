import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { PriceRuleView } from '@lfd/contracts';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { ArchivesPanel } from '../archives-panel/archives-panel';
import { TarificationService } from '../tarification.service';

/**
 * **Ce qu'on a rangé.** La liste doit dire trois choses : ce que la règle
 * faisait, qui l'a retirée, et pourquoi. Le reste — la reprendre — n'existe pas :
 * une décision archivée est close.
 */

function archived(overrides: Partial<PriceRuleView> = {}): PriceRuleView {
  return {
    id: 'rule_1',
    stage: 'promotion',
    scope: { type: 'category', id: 'viennoiserie' },
    audience: { type: 'all', id: null },
    minQuantity: null,
    effect: { nature: 'alter', direction: 'decrease', mode: 'percent', value: 1000 },
    label: 'Promo de rentrée',
    validFrom: '2026-08-01T00:00:00.000Z',
    validTo: null,
    createdBy: 'staff',
    createdAt: '2026-07-20T00:00:00.000Z',
    status: 'archived',
    pausedAt: null,
    pausedBy: null,
    archivedAt: '2026-09-02T09:00:00.000Z',
    archivedBy: 'auth0|marc',
    archiveReason: null,
    ...overrides,
  };
}

function mount(rules: PriceRuleView[], opened: string[] = []): ComponentFixture<ArchivesPanel> {
  const service: Pick<TarificationService, 'archivedRules'> = {
    archivedRules: () => Promise.resolve(rules),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: TarificationService, useValue: service },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      { provide: FoldPanelRef, useValue: { close: () => undefined } },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (component: { name: string }) => {
            opened.push(component.name);
            return { closed: Promise.resolve(false) };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ArchivesPanel);
  fixture.detectChanges();
  return fixture;
}

async function settled(fixture: ComponentFixture<ArchivesPanel>): Promise<string> {
  await fixture.whenStable();
  fixture.detectChanges();
  return String(fixture.nativeElement.textContent ?? '');
}

describe('les archives', () => {
  it("nomme la règle et ce qu'elle faisait", async () => {
    const text = await settled(mount([archived()]));

    expect(text).toContain('Promo de rentrée');
    expect(text).toContain('−10 %');
  });

  /** La question posée devant une archive est « qui », puis « pourquoi ». */
  it("dit qui l'a retirée, et quand", async () => {
    const text = await settled(mount([archived()]));

    expect(text).toContain('auth0|marc');
    expect(text).toContain('02/09/2026');
  });

  it('cite le motif quand il a été écrit', async () => {
    const text = await settled(mount([archived({ archiveReason: "Doublon de la promo d'été" })]));

    expect(text).toContain("Doublon de la promo d'été");
  });

  /**
   * Une liste vide n'est pas une erreur : rien n'a encore été rangé. Le dire
   * évite qu'on la prenne pour un chargement raté.
   */
  it('explique une liste vide', async () => {
    expect(await settled(mount([]))).toContain("Rien n'a été archivé");
  });

  /** Le seul geste possible ici est de LIRE : une décision archivée est close. */
  it('ouvre le journal de la règle rangée', async () => {
    const opened: string[] = [];
    const fixture = mount([archived()], opened);
    await settled(fixture);

    fixture.componentInstance['openJournal'](archived());

    expect(opened).toEqual(['JournalPanel']);
  });
});

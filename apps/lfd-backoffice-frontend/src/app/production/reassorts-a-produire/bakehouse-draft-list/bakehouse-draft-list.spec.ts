import { TestBed } from '@angular/core/testing';
import type { BakehouseResupplyDraftView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { BakehouseDraftList } from './bakehouse-draft-list';

/** La liste des brouillons ouverts du fournil (2026-10-28). */
describe('BakehouseDraftList', () => {
  const draft = (id: string, name: string | null, count: number): BakehouseResupplyDraftView => ({
    id,
    version: 1,
    siteId: 'site_v',
    target: 'asap',
    name,
    lines: Array.from({ length: count }, (_, i) => ({ sku: `S${String(i)}`, quantity: 1 })),
    savedByName: 'Hugo',
    savedAt: '2026-10-28T10:00:00.000Z',
  });

  function mount(current: string | null) {
    TestBed.configureTestingModule({ imports: [BakehouseDraftList] });
    const fixture = TestBed.createComponent(BakehouseDraftList);
    fixture.componentRef.setInput('drafts', [draft('a', 'Goûter', 1), draft('b', null, 3)]);
    fixture.componentRef.setInput('siteLabels', new Map([['site_v', 'Village']]));
    fixture.componentRef.setInput('currentId', current);
    const resumed: string[] = [];
    fixture.componentInstance.resumed.subscribe((d) => resumed.push(d.id));
    fixture.detectChanges();
    return { root: fixture.nativeElement as HTMLElement, resumed };
  }

  it('dit le nom (ou « Sans nom »), le point, la visée et le nombre d’articles', () => {
    const { root } = mount(null);
    const texts = [...root.querySelectorAll('[data-bakehouse-draft]')].map((li) => li.textContent);

    expect(texts[0]).toContain('Goûter');
    expect(texts[0]).toContain('Village · au plus tôt · 1 article ·');
    expect(texts[1]).toContain('Sans nom');
    expect(texts[1]).toContain('3 articles');
  });

  it('ne reprend pas deux fois le brouillon déjà en main', () => {
    const { root, resumed } = mount('a');
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-bakehouse-draft-resume]')];

    expect(buttons[0]?.disabled).toBe(true);
    expect(buttons[0]?.textContent).toContain('Repris');
    buttons[1]?.click();
    expect(resumed).toEqual(['b']);
  });
});

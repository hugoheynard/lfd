import { TestBed } from '@angular/core/testing';
import type { PricingJournalEntryView, PricingSubjectType } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { TarificationService } from '../../../b2b/tarification/tarification.service';
import { TariffJournalCard } from './tariff-journal-card';

/**
 * La carte « Journal du tarif » de l'onglet Tarifs (`plan-sous-comptes.md`,
 * S3) : elle lit le compte tarifaire de LA société (sujet `company`) et pose
 * les phrases figées en place, sans panneau.
 */
function entry(over: Partial<PricingJournalEntryView>): PricingJournalEntryView {
  return {
    id: 'evt_1',
    subjectType: 'company',
    subjectId: 'co_site',
    act: 'started',
    actor: 'staff_1',
    actorName: 'Colette Martin',
    occurredAt: '2026-09-01T08:00:00.000Z',
    reason: null,
    summary: 'Suit la mercuriale de Club Med depuis le 1er septembre 2026',
    ...over,
  };
}

async function mount(entries: readonly PricingJournalEntryView[]) {
  const asked: { subjectType: PricingSubjectType; subjectId: string }[] = [];
  const service: Pick<TarificationService, 'journalPage'> = {
    journalPage: (subjectType, subjectId) => {
      asked.push({ subjectType, subjectId });
      return Promise.resolve({
        entries,
        total: entries.length,
        page: 1,
        pageSize: 20,
        asOf: entries.length === 0 ? null : 'evt_1',
      });
    },
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: TarificationService, useValue: service },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(TariffJournalCard);
  fixture.componentRef.setInput('companyId', 'co_site');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { host: fixture.nativeElement as HTMLElement, asked };
}

describe('le journal du tarif d’un client', () => {
  it('lit le compte tarifaire de la société, une fois', async () => {
    const { asked } = await mount([entry({})]);

    expect(asked).toEqual([{ subjectType: 'company', subjectId: 'co_site' }]);
  });

  it('pose les phrases figées en place, la plus récente d’abord', async () => {
    const { host } = await mount([
      entry({
        id: 'evt_2',
        act: 'ended',
        summary: 'Ne suit plus la mercuriale de Club Med (le 1er octobre 2026)',
      }),
      entry({}),
    ]);

    const summaries = [...host.querySelectorAll('.act-summary')].map((node) =>
      node.textContent?.trim(),
    );
    expect(summaries).toEqual([
      'Ne suit plus la mercuriale de Club Med (le 1er octobre 2026)',
      'Suit la mercuriale de Club Med depuis le 1er septembre 2026',
    ]);
    expect(host.textContent).toContain('Journal du tarif');
  });

  it('dit pourquoi le journal est vide', async () => {
    const { host } = await mount([]);

    expect(host.textContent).toContain('Ce compte n’a jamais suivi de mercuriale');
  });
});

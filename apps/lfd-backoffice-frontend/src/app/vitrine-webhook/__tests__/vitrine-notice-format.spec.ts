import type { VitrineSubscriberView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { noticeOutcome, noticeSelection, vitrineNoticeIssue } from '../vitrine-notice-format';

const sub = (id: string, contactEmail: string | null): VitrineSubscriberView => ({
  id,
  name: id,
  description: null,
  contactEmail,
  endpointUrl: 'https://a.example/h',
  contents: [],
  state: 'inactive',
  failedAt: null,
  lastSequence: 0,
  createdAt: '2026-10-18T08:00:00.000Z',
});

describe('vitrine-notice-format', () => {
  it('dit ce qui manque, dans l’ordre de la saisie', () => {
    expect(vitrineNoticeIssue({ subject: ' ', message: 'm', selectedCount: 1 })).toContain('objet');
    expect(vitrineNoticeIssue({ subject: 'o', message: '', selectedCount: 1 })).toContain(
      'message',
    );
    expect(vitrineNoticeIssue({ subject: 'o', message: 'm', selectedCount: 0 })).toContain(
      'destinataire',
    );
    expect(vitrineNoticeIssue({ subject: 'o', message: 'm', selectedCount: 1 })).toBe('');
  });

  it('tous les contacts cochés valent « tous », un coupé compris', () => {
    const all = [sub('a', 'a@x.fr'), sub('b', null)];
    expect(noticeSelection(all, new Set(['a']))).toBeNull();
    expect(noticeSelection([...all, sub('c', 'c@x.fr')], new Set(['c']))).toEqual(['c']);
  });

  it('l’issue d’un e-mail', () => {
    expect([noticeOutcome(true), noticeOutcome(false), noticeOutcome(null)]).toEqual([
      'accepted',
      'refused',
      'pending',
    ]);
  });
});

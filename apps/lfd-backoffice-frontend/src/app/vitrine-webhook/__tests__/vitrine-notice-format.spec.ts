import type { VitrineNoticeView, VitrineSubscriberView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  noticeAuthor,
  noticeOutcome,
  noticeSelection,
  unattemptedCount,
  vitrineNoticeIssue,
} from '../vitrine-notice-format';

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

const notice = (overrides: Partial<VitrineNoticeView> = {}): VitrineNoticeView => ({
  id: 'n1',
  authorStaffId: 'staff_1',
  authorName: 'Inès Boutique',
  subject: 'o',
  message: 'm',
  createdAt: '2026-10-18T08:00:00.000Z',
  recipients: [
    {
      subscriberId: 'a',
      subscriberName: 'a',
      contactEmail: 'a@x.fr',
      mailSent: true,
      attemptedAt: null,
    },
    {
      subscriberId: 'b',
      subscriberName: 'b',
      contactEmail: 'b@x.fr',
      mailSent: false,
      attemptedAt: null,
    },
    {
      subscriberId: 'c',
      subscriberName: 'c',
      contactEmail: 'c@x.fr',
      mailSent: null,
      attemptedAt: null,
    },
  ],
  ...overrides,
});

describe('une annonce au journal', () => {
  it('nomme l’auteur, et retombe sur son id quand l’annuaire ne le connaît plus', () => {
    expect(noticeAuthor(notice())).toBe('Inès Boutique');
    expect(noticeAuthor(notice({ authorName: null }))).toBe('staff_1');
  });

  it('ne compte à reprendre que les pas tentés — ni l’accepté, ni le refusé', () => {
    expect(unattemptedCount(notice())).toBe(1);
    expect(unattemptedCount(notice({ recipients: [] }))).toBe(0);
  });
});

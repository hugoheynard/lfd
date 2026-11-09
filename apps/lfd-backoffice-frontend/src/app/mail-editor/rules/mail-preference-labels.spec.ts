import { describe, expect, it } from 'vitest';

import {
  mailPreferenceBadge,
  mailPreferenceLastAt,
  mailPreferenceQuery,
  mailPreferenceRecipient,
  mailPreferenceWhere,
  NO_MAIL_PREFERENCE_FILTERS,
} from './mail-preference-labels';

describe('les désinscriptions et accords — libellés (C4)', () => {
  it('dit l’état en toutes lettres', () => {
    expect(mailPreferenceBadge({ status: 'unsubscribed' })).toEqual({
      label: 'Désinscrit',
      tone: 'warning',
    });
    expect(mailPreferenceBadge({ status: 'pending' }).label).toBe('En attente de confirmation');
  });

  it('montre l’adresse masquée, ou dit qu’elle est effacée', () => {
    expect(mailPreferenceRecipient({ recipient: 'c•••@halles.fr' })).toBe('c•••@halles.fr');
    expect(mailPreferenceRecipient({ recipient: null })).toBe('Adresse effacée');
  });

  it('dit le lieu de l’accord, sinon ce qui a désinscrit', () => {
    expect(mailPreferenceWhere({ place: 'order', unsubscribedSource: 'link' })).toBe('Commande');
    expect(mailPreferenceWhere({ place: null, unsubscribedSource: 'staff' })).toBe(
      'Le staff, à la demande du client',
    );
    expect(mailPreferenceWhere({ place: null, unsubscribedSource: null })).toBe('');
  });

  it('date la ligne de son dernier geste', () => {
    expect(mailPreferenceLastAt({ requestedAt: 'a', confirmedAt: 'b', unsubscribedAt: null })).toBe(
      'b',
    );
    expect(mailPreferenceLastAt({ requestedAt: 'a', confirmedAt: 'b', unsubscribedAt: 'c' })).toBe(
      'c',
    );
  });

  it('ne pose que les critères choisis, jamais une adresse', () => {
    expect(mailPreferenceQuery(NO_MAIL_PREFERENCE_FILTERS, null)).toEqual({});
    expect(mailPreferenceQuery({ space: 'lfc', status: 'accepted' }, 'pref_9')).toEqual({
      space: 'lfc',
      status: 'accepted',
      cursor: 'pref_9',
    });
  });
});

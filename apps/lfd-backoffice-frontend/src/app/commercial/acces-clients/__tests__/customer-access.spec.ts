import type { CustomerAccessRowView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  activatedLabel,
  canResend,
  matchesFilter,
  matchesSearch,
  membersLabel,
  resendMessage,
  resendPayload,
  sortRows,
} from '../customer-access';

function row(over: Partial<CustomerAccessRowView> = {}): CustomerAccessRowView {
  return {
    companyId: 'c1',
    companyName: 'Le Comptoir',
    parent: null,
    holderInheritedFrom: null,
    holder: { firstName: 'Camille', lastName: 'Durand', email: 'camille@test.fr', phone: '06' },
    state: 'invited',
    activatedAt: null,
    lastInvitedAt: null,
    otherMembers: 0,
    otherMembersActive: 0,
    ...over,
  };
}

describe('accès clients — logique de la table', () => {
  it('range l’expiré et le désactivé sous la même puce', () => {
    expect(matchesFilter(row({ state: 'expired' }), 'lapsed')).toBe(true);
    expect(matchesFilter(row({ state: 'disabled' }), 'lapsed')).toBe(true);
    expect(matchesFilter(row({ state: 'invited' }), 'lapsed')).toBe(false);
    expect(matchesFilter(row({ state: 'no_holder', holder: null }), 'no_holder')).toBe(true);
  });

  it('cherche par société, principal, e-mail ou nom, sans accent ni casse', () => {
    const sub = row({ parent: { companyId: 'p', companyName: 'Groupe Hôtelier' } });
    expect(matchesSearch(sub, 'hotelier')).toBe(true);
    expect(matchesSearch(row(), 'CAMILLE@')).toBe(true);
    expect(matchesSearch(row(), 'durand')).toBe(true);
    expect(matchesSearch(row(), 'inconnu')).toBe(false);
  });

  it('trie par état — ce qui appelle un geste d’abord — puis par société', () => {
    const sorted = sortRows([
      row({ companyId: 'a', state: 'active', companyName: 'Alpha' }),
      row({ companyId: 'b', state: 'invited', companyName: 'Zeta' }),
      row({ companyId: 'c', state: 'invited', companyName: 'Bêta' }),
      row({ companyId: 'd', state: 'no_holder', holder: null, companyName: 'Omega' }),
    ]);
    expect(sorted.map((r) => r.companyId)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('ne propose la relance qu’à un détenteur invité ou expiré', () => {
    expect(canResend(row({ state: 'invited' }))).toBe(true);
    expect(canResend(row({ state: 'expired' }))).toBe(true);
    expect(canResend(row({ state: 'active' }))).toBe(false);
    expect(canResend(row({ state: 'no_holder', holder: null }))).toBe(false);
    const inherited = { companyId: 'p', companyName: 'Groupe' };
    expect(canResend(row({ state: 'invited', holderInheritedFrom: inherited }))).toBe(false);
  });

  it('relance le détenteur en `owner`, avec son profil tel quel', () => {
    expect(resendPayload(row())).toEqual({
      email: 'camille@test.fr',
      firstName: 'Camille',
      lastName: 'Durand',
      phone: '06',
      role: 'owner',
    });
  });

  it('dit le sort réel de l’envoi', () => {
    expect(resendMessage(true, 'a@b.fr')).toContain('parti à a@b.fr');
    expect(resendMessage(false, 'a@b.fr')).toContain("n'est pas parti");
  });

  it('avoue une date d’activation inconnue plutôt que de l’inventer', () => {
    expect(activatedLabel(row({ state: 'active' }))).toBe('Activé (date inconnue)');
    expect(activatedLabel(row({ state: 'invited' }))).toBeNull();
  });

  it('compte les autres membres et ceux qui sont activés', () => {
    expect(membersLabel(row())).toBe('—');
    expect(membersLabel(row({ otherMembers: 2, otherMembersActive: 1 }))).toBe(
      '2 autres · 1 activé',
    );
  });
});

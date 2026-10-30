import { describe, expect, it } from 'vitest';

import { actorBy, actorSubject } from '../phrase';
import { renderFact } from '../render-fact';

/**
 * La qualité de l'auteur, après son nom (décision de Hugo du 2026-10-30, §7
 * de `plan-phrases-du-journal.md`) — dite une seule fois par ligne.
 */
describe('la qualité de l’auteur', () => {
  it('staff : « staff LFD — fonction », ou « staff LFD » sans fonction', () => {
    expect(actorBy('Colette Martin', 'Commercial', 'staff')).toBe(
      'Colette Martin (staff LFD — Commercial)',
    );
    expect(actorBy('Colette Martin', null, 'staff')).toBe('Colette Martin (staff LFD)');
  });

  it('client : la qualité figée, et rien sur une ligne d’avant', () => {
    expect(actorSubject('Jean Dupont', 'customer', 'client pro')).toBe('Jean Dupont (client pro)');
    expect(actorSubject('Jean Dupont', 'customer', 'client particulier')).toBe(
      'Jean Dupont (client particulier)',
    );
    expect(actorSubject('Jean Dupont', 'customer', null)).toBe('Jean Dupont');
  });

  it('système, auteur sans nom, vue sans la colonne : inchangés', () => {
    expect(actorBy(null, null, 'system')).toBe('le système');
    expect(actorSubject(null, 'staff', 'Commercial')).toBe('Un membre de l’équipe');
    expect(actorBy('Colette Martin', undefined, 'staff')).toBe('Colette Martin');
  });

  it('une phrase à la voix active porte la qualité en sujet, une seule fois', () => {
    const rendered = renderFact({
      type: 'subscription.status_changed',
      payload: { before: 'active', after: 'paused' },
      subjectType: 'subscription',
      subjectId: 'sub_1',
      actorName: 'Jean Dupont',
      actorType: 'customer',
      actorRole: 'client pro',
    });

    expect(rendered.namesActor).toBe(true);
    expect(rendered.sentence.startsWith('Jean Dupont (client pro) ')).toBe(true);
    expect(rendered.sentence.match(/client pro/gu)).toHaveLength(1);
  });
});

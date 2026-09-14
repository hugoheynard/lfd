import { signal } from '@angular/core';

import { ClientPreferences } from '../../../client-preferences.service';
import { FR } from '../../../copy/fr';
import { bootCard, TOMMEUSES } from '../../account.fixture';
import { PreferencesDeskCard } from './preferences-desk-card';

describe('PreferencesDeskCard', () => {
  /** Rétablis le 2026-09-14 : les deux « Modifier » en ligne, sans action d'origine. */
  it('lit l’habitude et la langue, chacune avec son « Modifier », et la règle dessous', () => {
    const el = bootCard(
      PreferencesDeskCard,
      [TOMMEUSES],
      [
        {
          provide: ClientPreferences,
          useValue: { habit: signal('Retrait au Labo'), language: signal('Français') },
        },
      ],
    ).nativeElement as HTMLElement;

    const facts = el.querySelector('.facts');
    expect(facts?.textContent).toContain('Retrait au Labo');
    expect(facts?.textContent).toContain('Français');
    expect(
      Array.from(facts?.querySelectorAll('dd button') ?? []).map((b) => b.textContent?.trim()),
    ).toEqual([FR.account.edit, FR.account.edit]);
    expect(el.textContent).toContain(FR.account.prefNote);
  });
});

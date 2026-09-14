import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';

import { ClientPreferences } from '../../../client-preferences.service';
import { FR } from '../../../copy/fr';
import { PreferencesPanel } from './preferences-panel';

describe('PreferencesPanel', () => {
  it('lit l’habitude et la langue, la règle dessous, et n’offre aucun faux réglage', () => {
    TestBed.configureTestingModule({
      imports: [PreferencesPanel],
      providers: [
        {
          provide: ClientPreferences,
          useValue: { habit: signal('Retrait au Labo'), language: signal('Français') },
        },
        { provide: FoldPanelRef, useValue: new FoldPanelRef(1, () => undefined) },
      ],
    });
    const fixture = TestBed.createComponent(PreferencesPanel);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('Retrait au Labo');
    expect(el.textContent).toContain('Français');
    expect(el.textContent).toContain(FR.account.prefNote);
    expect(el.querySelectorAll('fold-panel-body button').length).toBe(0);
  });
});

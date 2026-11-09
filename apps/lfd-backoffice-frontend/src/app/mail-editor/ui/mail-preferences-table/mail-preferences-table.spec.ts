import { TestBed } from '@angular/core/testing';
import type { MailPreferenceListItemView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { MailPreferencesTable } from './mail-preferences-table';

const ACCEPTED: MailPreferenceListItemView = {
  id: 'pref_1',
  space: 'lfc',
  status: 'accepted',
  recipient: 'c•••@halles.fr',
  origin: 'direct',
  place: 'order',
  requestedAt: new Date().toISOString(),
  confirmedAt: new Date().toISOString(),
  unsubscribedAt: null,
  unsubscribedSource: null,
};

function setup(rows: readonly MailPreferenceListItemView[]) {
  TestBed.configureTestingModule({ imports: [MailPreferencesTable] });
  const fixture = TestBed.createComponent(MailPreferencesTable);
  fixture.componentRef.setInput('rows', rows);
  fixture.componentRef.setInput('empty', { title: 'Aucune ligne ne correspond' });
  const opened: MailPreferenceListItemView[] = [];
  fixture.componentInstance.opened.subscribe((row) => opened.push(row));
  fixture.detectChanges();
  return { element: fixture.nativeElement as HTMLElement, opened };
}

describe('MailPreferencesTable — la liste du registre (C4)', () => {
  it('montre l’état, l’espace, l’adresse masquée, l’origine et le lieu en toutes lettres', () => {
    const text = setup([ACCEPTED]).element.textContent ?? '';
    expect(text).toContain('Inscrit');
    expect(text).toContain('La Folie Coffee — clients');
    expect(text).toContain('c•••@halles.fr');
    expect(text).toContain('Accord donné à la société');
    expect(text).toContain('Commande');
  });

  it('dit une adresse effacée, et la source d’une désinscription sans accord', () => {
    const text =
      setup([
        {
          ...ACCEPTED,
          status: 'unsubscribed',
          recipient: null,
          origin: null,
          place: null,
          unsubscribedAt: new Date().toISOString(),
          unsubscribedSource: 'one_click',
        },
      ]).element.textContent ?? '';
    expect(text).toContain('Désinscrit');
    expect(text).toContain('Adresse effacée');
    expect(text).toContain('Bouton de la messagerie');
  });

  it('dit le vide', () => {
    expect(setup([]).element.textContent).toContain('Aucune ligne ne correspond');
  });
});

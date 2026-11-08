import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { MailSendListItemView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { MailSendsTable } from './mail-sends-table';

const BOUNCED: MailSendListItemView = {
  id: 'm1',
  template: 'customer.order-placed',
  space: 'lfc',
  recipient: 'c•••@halles.fr',
  state: 'accepted',
  delivery: 'bounced',
  requestedAt: new Date().toISOString(),
  problem: true,
  refusalCode: null,
  subjects: [],
};

function setup(rows: readonly MailSendListItemView[]) {
  TestBed.configureTestingModule({ imports: [MailSendsTable], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(MailSendsTable);
  fixture.componentRef.setInput('rows', rows);
  fixture.componentRef.setInput('empty', { title: 'Aucun envoi ne correspond' });
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('MailSendsTable — la liste des envois', () => {
  it('montre la pastille en texte, l’intitulé du modèle, l’espace et l’adresse masquée', () => {
    const text = setup([BOUNCED]).textContent ?? '';
    expect(text).toContain('Accepté par Resend · Rebondi');
    expect(text).toContain('Commande passée');
    expect(text).toContain('La Folie Coffee — clients');
    expect(text).toContain('c•••@halles.fr');
  });

  it('dit le vide', () => {
    expect(setup([]).textContent).toContain('Aucun envoi ne correspond');
  });

  it('fait d’un sujet commande un lien vers sa fiche, et dit les autres en texte', () => {
    const element = setup([
      {
        ...BOUNCED,
        subjects: [
          { type: 'order', id: 'cmd_1' },
          { type: 'account', id: 'acc_45' },
        ],
      },
    ]);
    expect(element.querySelector('[data-subject-link]')?.getAttribute('href')).toBe(
      '/commandes/cmd_1',
    );
    expect(element.querySelector('[data-subject-link]')?.textContent).toContain('Commande');
    expect(element.querySelector('[data-subject-text]')?.textContent).toContain('Compte acc_45');
  });
});

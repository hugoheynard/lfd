import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ContactMessageView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ContactService } from '../contact.service';
import { ContactPage } from './contact-page';

/** Les trois onglets de Contact, et le compteur de la messagerie, masqué à zéro. */

function message(id: string): ContactMessageView {
  return {
    id,
    subjectId: 'cs_1',
    subjectLabel: 'Ma commande',
    audience: 'b2c',
    priority: 'medium',
    authorName: 'Jeanne',
    authorEmail: 'jeanne@example.fr',
    authorPhone: '',
    message: 'Bonjour',
    userId: null,
    companyId: null,
    receivedAt: '2026-10-09T08:00:00.000Z',
    handledAt: null,
    handledBy: null,
    anonymizedAt: null,
  };
}

async function mount(pending: number | Error): Promise<ContactPage> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ContactPage],
    providers: [
      provideRouter([]),
      {
        provide: ContactService,
        useValue: {
          messages: () =>
            pending instanceof Error
              ? Promise.reject(pending)
              : Promise.resolve(
                  Array.from({ length: pending }, (_, i) => message(`m${String(i)}`)),
                ),
        } satisfies Pick<ContactService, 'messages'>,
      },
    ],
  });
  const fixture = TestBed.createComponent(ContactPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.componentInstance;
}

const badgeOf = (page: ContactPage) => page['tabs']().find((tab) => tab.key === 'messages')?.badge;

describe('ContactPage', () => {
  it('trois onglets routés, dans l’ordre demandé', async () => {
    const page = await mount(0);
    expect(page['tabs']().map((tab) => tab.link)).toEqual(['carte', 'formulaire', 'messages']);
  });

  it('la messagerie porte le nombre de messages à traiter', async () => {
    expect(badgeOf(await mount(3))).toBe(3);
  });

  it('pas de pastille à zéro, ni quand le compte n’a pas pu être lu', async () => {
    expect(badgeOf(await mount(0))).toBeNull();
    expect(badgeOf(await mount(new Error('indisponible')))).toBeNull();
  });
});

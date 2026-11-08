import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { MailRecipientView, MailSendDetailView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { MailSendsService } from '../../data/mail-sends.service';
import { MailSendPanel } from './mail-send-panel';

const AT = new Date().toISOString();
const DETAIL: MailSendDetailView = {
  id: 'm1',
  template: 'customer.order-placed',
  space: 'lfc',
  recipient: 'c•••@halles.fr',
  state: 'accepted',
  delivery: 'bounced',
  requestedAt: AT,
  problem: true,
  subjects: [],
  locale: 'fr',
  deliveryKind: 'Permanent/Suppressed',
  documentVersion: 3,
  attempts: 1,
  steps: [
    { step: 'requested', at: AT },
    { step: 'bounced', at: AT },
  ],
};
const RECIPIENT: MailRecipientView = {
  id: 'm1',
  recipient: 'claire@halles.fr',
  failureReason: null,
  revealedUntil: AT,
};

async function setup(api: Partial<Record<keyof MailSendsService, unknown>>) {
  TestBed.configureTestingModule({
    imports: [MailSendPanel],
    providers: [
      provideRouter([]),
      { provide: MailSendsService, useValue: api },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, () => undefined) },
    ],
  });
  const fixture = TestBed.createComponent(MailSendPanel);
  fixture.componentRef.setInput('data', { id: 'm1' });
  const settle = async () => {
    for (let pass = 0; pass < 3; pass += 1) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  };
  await settle();
  return { element: fixture.nativeElement as HTMLElement, settle };
}

describe('MailSendPanel — le détail d’un envoi', () => {
  it('montre les étapes, le genre du retour et la version, l’adresse masquée', async () => {
    const { element } = await setup({ detail: vi.fn(() => Promise.resolve(DETAIL)) });
    const text = element.textContent ?? '';
    expect(text).toContain('Définitif (Suppressed)');
    expect(text).toContain('Version 3');
    expect(text).toContain('Rebondi');
    expect(text).toContain('c•••@halles.fr');
    expect(text).toContain('inscrit la consultation au journal');
    expect(text).not.toContain('claire@halles.fr');
  });

  it('« Afficher l’adresse » révèle puis montre l’adresse, et dit la trace', async () => {
    const revealRecipient = vi.fn(() => Promise.resolve(RECIPIENT));
    const { element, settle } = await setup({
      detail: vi.fn(() => Promise.resolve(DETAIL)),
      revealRecipient,
    });
    element.querySelector<HTMLButtonElement>('[data-reveal]')?.click();
    await settle();
    expect(revealRecipient).toHaveBeenCalledWith('m1');
    expect(element.querySelector('[data-recipient]')?.textContent).toBe('claire@halles.fr');
    expect(element.textContent).toContain('Consultation inscrite au journal');
  });

  it('le plafond du serveur s’affiche tel quel', async () => {
    const refusal = new HttpErrorResponse({
      status: 409,
      error: { message: 'Trente consultations dans l’heure : réessayez plus tard.' },
    });
    const { element, settle } = await setup({
      detail: vi.fn(() => Promise.resolve(DETAIL)),
      revealRecipient: vi.fn(() => Promise.reject(refusal)),
    });
    element.querySelector<HTMLButtonElement>('[data-reveal]')?.click();
    await settle();
    expect(element.querySelector('[data-reveal-error]')?.textContent).toContain(
      'Trente consultations',
    );
  });

  it('un envoi illisible le dit, avec de quoi réessayer', async () => {
    const { element } = await setup({ detail: vi.fn(() => Promise.reject(new Error('x'))) });
    expect(element.textContent).toContain('Cet envoi n’a pas pu être lu');
  });

  it('mène un sujet commande à sa fiche', async () => {
    const detail: MailSendDetailView = { ...DETAIL, subjects: [{ type: 'order', id: 'cmd_1' }] };
    const { element } = await setup({ detail: vi.fn(() => Promise.resolve(detail)) });
    const link = element.querySelector('[data-subject-link]');
    expect(link?.getAttribute('href')).toBe('/commandes/cmd_1');
    expect(link?.textContent).toContain('Commande');
  });
});

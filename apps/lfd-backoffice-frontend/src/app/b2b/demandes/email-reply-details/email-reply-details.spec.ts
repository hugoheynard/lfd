import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { EmailReplyDetailsView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { EmailReplyDetails } from './email-reply-details';

/** Les détails d'une réponse par e-mail : verdict, commande présumée, pièces jointes listées. */

const DETAILS: EmailReplyDetailsView = {
  kind: 'email_reply',
  subject: 'Re: <b>ORD-0042</b>',
  attachments: [
    { filename: 'facture.pdf', contentType: 'application/pdf', sizeBytes: 2048 },
    { filename: '<img src=x>.png', contentType: 'image/png', sizeBytes: 300 },
  ],
  authentication: { spf: 'pass', dkim: 'pass', dmarc: 'pass', dkimAligned: true },
  senderVerified: true,
  orderId: 'o_42',
  orderNumber: 'ORD-0042',
};

function mount(details: EmailReplyDetailsView): ComponentFixture<EmailReplyDetails> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [EmailReplyDetails], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(EmailReplyDetails);
  fixture.componentRef.setInput('requestId', 'cr_1');
  fixture.componentRef.setInput('details', details);
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<EmailReplyDetails>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('EmailReplyDetails', () => {
  it('expéditeur vérifié : pas de badge', () => {
    expect(host(mount(DETAILS)).querySelector('[data-unverified]')).toBeNull();
  });

  it('expéditeur non vérifié : le badge le dit', () => {
    const el = host(mount({ ...DETAILS, senderVerified: false }));
    expect(el.querySelector('[data-unverified]')?.textContent).toContain('Expéditeur non vérifié');
  });

  it('la commande est liée et dite présumée', () => {
    const el = host(mount(DETAILS));
    expect(el.querySelector('a[data-order-link]')?.getAttribute('href')).toBe('/commandes/o_42');
    expect(el.textContent).toContain('Commande présumée');
  });

  it('les pièces jointes sont listées — nom, type, taille — sans aucun lien', () => {
    const el = host(mount(DETAILS));
    const items = el.querySelectorAll('[data-attachment]');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('facture.pdf');
    expect(items[0]?.textContent).toContain('application/pdf');
    expect(items[0]?.textContent).toContain('2 Ko');
    expect(items[1]?.textContent).toContain('<img src=x>.png');
    expect(items[1]?.textContent).toContain('300 o');
    expect(el.querySelectorAll('a')).toHaveLength(1);
    expect(el.querySelector('img')).toBeNull();
  });

  it("l'objet s'affiche en texte, balises comprises", () => {
    const subject = host(mount(DETAILS)).querySelector('[data-subject]');
    expect(subject?.textContent).toBe('Re: <b>ORD-0042</b>');
    expect(subject?.querySelector('b')).toBeNull();
  });

  it('anonymisée : ni objet, ni commande, ni pièce jointe', () => {
    const el = host(
      mount({ ...DETAILS, subject: '', attachments: [], orderId: null, orderNumber: null }),
    );
    expect(el.querySelector('a')).toBeNull();
    expect(el.querySelector('[data-attachment]')).toBeNull();
    expect(el.textContent).toContain('Sans objet');
  });
});

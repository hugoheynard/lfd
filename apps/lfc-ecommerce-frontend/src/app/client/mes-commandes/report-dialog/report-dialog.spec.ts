import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CustomerAudience, PublicRequestReasonView } from '@lfd/contracts/shop-values';
import { FoldPanelRef } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { ClientAudience } from '../../client-audience.service';
import { FR } from '../../copy/fr';
import { ContactGateway } from '../../shop/contact.gateway';
import { OrderProblemGateway, type OrderProblemDraft } from '../order-problem.gateway';
import { photoIssue, ReportDialog } from './report-dialog';

/**
 * **« Signaler un problème »** — les motifs du public, les photos contrôlées
 * avant l'envoi, l'envoi réel, le refus gardé dans le dialogue.
 */

const REASONS: PublicRequestReasonView[] = [
  { id: 'r-missing', label: { fr: 'Un article manquait', en: '', it: '' } },
];

const photo = (name: string, type: string, bytes = 10): File =>
  new File([new Uint8Array(bytes)], name, { type });

interface Mounted {
  readonly fixture: ComponentFixture<ReportDialog>;
  readonly asked: [string, CustomerAudience][];
  readonly sent: [string, OrderProblemDraft][];
  readonly closed: unknown[];
  readonly toasts: string[];
}

async function mount(
  refusal: string | null = null,
  audience: CustomerAudience = 'b2b',
): Promise<Mounted> {
  const asked: [string, CustomerAudience][] = [];
  const sent: [string, OrderProblemDraft][] = [];
  const closed: unknown[] = [];
  const toasts: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ReportDialog],
    providers: [
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (result) => closed.push(result)) },
      {
        provide: ContactGateway,
        useValue: {
          reasons: (kind: string, who: CustomerAudience) => {
            asked.push([kind, who]);
            return Promise.resolve(REASONS);
          },
        },
      },
      {
        provide: OrderProblemGateway,
        useValue: {
          report: (orderId: string, draft: OrderProblemDraft) => {
            sent.push([orderId, draft]);
            return Promise.resolve(refusal);
          },
        },
      },
      { provide: NotifyService, useValue: { success: (m: string) => toasts.push(m) } },
      { provide: ClientAudience, useValue: { shown: signal(audience) } },
    ],
  });
  const fixture = TestBed.createComponent(ReportDialog);
  fixture.componentRef.setInput('data', { orderId: 'o-1', reference: 'LFC-0042' });
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, asked, sent, closed, toasts };
}

function dialog(fixture: ComponentFixture<ReportDialog>) {
  const d = fixture.componentInstance;
  return {
    reasonId: d['reasonId'],
    message: d['message'],
    photos: () => d['photos'](),
    rejects: () => d['photoRejects'](),
    pick: (files: File[]) => d['pick'](files),
    remove: (index: number) => d['remove'](d['photos']()[index]!),
    canSend: () => d['canSend'](),
    send: () => d['send'](),
  };
}

describe('photoIssue', () => {
  it('refuse un type hors JPEG/PNG/WebP, et une photo de plus de 5 Mo', () => {
    expect(photoIssue(photo('a.gif', 'image/gif'))).toBe('type');
    expect(photoIssue(photo('a.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1))).toBe('size');
    expect(photoIssue(photo('a.webp', 'image/webp'))).toBeNull();
  });
});

describe('ReportDialog', () => {
  // jsdom ne fabrique pas d'URL d'aperçu : un compteur suffit à les distinguer.
  let previews = 0;
  beforeEach(() => {
    URL.createObjectURL = () => `blob:preview-${(previews += 1)}`;
    URL.revokeObjectURL = () => undefined;
  });

  it('🔴 ne liste que les motifs `order_problem` du public de l’espace', async () => {
    const { asked } = await mount(null, 'b2c');
    expect(asked).toEqual([['order_problem', 'b2c']]);
  });

  it('n’envoie pas sans motif ; le mot est facultatif', async () => {
    const { fixture } = await mount();
    const d = dialog(fixture);
    expect(d.canSend()).toBe(false);
    d.reasonId.set('r-missing');
    expect(d.canSend()).toBe(true);
  });

  it('écarte avant l’envoi un mauvais type, une photo trop lourde, une quatrième', async () => {
    const { fixture } = await mount();
    const d = dialog(fixture);

    d.pick([photo('ok1.jpg', 'image/jpeg'), photo('x.gif', 'image/gif')]);
    expect(d.photos()).toHaveLength(1);
    expect(d.rejects()).toEqual(['« x.gif » n’est pas une photo JPEG, PNG ou WebP.']);

    d.pick([
      photo('ok2.png', 'image/png'),
      photo('ok3.webp', 'image/webp'),
      photo('ok4.jpg', 'image/jpeg'),
    ]);
    expect(d.photos()).toHaveLength(3);
    expect(d.rejects()).toEqual(['3 photos au plus.']);

    d.remove(0);
    expect(d.photos().map((p) => p.file.name)).toEqual(['ok2.png', 'ok3.webp']);
  });

  it('envoie motif, mot et photos à la commande, annonce, puis ferme', async () => {
    const { fixture, sent, closed, toasts } = await mount();
    const d = dialog(fixture);
    d.reasonId.set('r-missing');
    d.message.set('  Deux croissants en moins  ');
    d.pick([photo('sac.jpg', 'image/jpeg')]);

    await d.send();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.[0]).toBe('o-1');
    expect(sent[0]?.[1].reasonId).toBe('r-missing');
    expect(sent[0]?.[1].message).toBe('Deux croissants en moins');
    expect(sent[0]?.[1].photos.map((f) => f.name)).toEqual(['sac.jpg']);
    expect(toasts).toEqual([FR.orders.reportSent]);
    expect(closed).toEqual([true]);
  });

  it('garde un refus (409) dans le dialogue, ouvert', async () => {
    const { fixture, closed } = await mount('Cette commande n’est pas encore retirée ni livrée.');
    const d = dialog(fixture);
    d.reasonId.set('r-missing');

    await d.send();
    fixture.detectChanges();

    expect(closed).toEqual([]);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('fold-callout')?.textContent,
    ).toContain('pas encore retirée');
  });
});

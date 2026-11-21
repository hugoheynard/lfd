import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { AdminOrderReviewEntry, StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminOrdersService } from '../orders.service';
import { OrderReviewCard, type ReviewSubject } from './order-review-card';

const WRITER: readonly StaffPermission[] = ['b2b_order_review:write'];

const STAMP: AdminOrderReviewEntry = {
  id: 'r1',
  reviewedRevision: 0,
  reviewedAt: '2026-11-20T13:32:00.000Z',
  reviewedByName: 'Lou Martin',
  note: 'Quantités habituelles.',
  withdrawn: null,
};

const TO_REVIEW: ReviewSubject = {
  id: 'o1',
  review: { current: null, revisedSinceReview: false, reviewable: true, history: [] },
};

const REVIEWED: ReviewSubject = {
  id: 'o1',
  review: { current: STAMP, revisedSinceReview: false, reviewable: false, history: [STAMP] },
};

function mount(
  order: ReviewSubject,
  granted: readonly StaffPermission[],
  review = vi.fn((_id: string, _note: string | null, _key: string) => Promise.resolve()),
) {
  const withdrawReview = vi.fn((_id: string, _key: string) => Promise.resolve());
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AdminOrdersService, useValue: { review, withdrawReview } },
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
    ],
  });
  const fixture = TestBed.createComponent(OrderReviewCard);
  fixture.componentRef.setInput('order', order);
  let changed = 0;
  fixture.componentInstance.changed.subscribe(() => (changed += 1));
  fixture.detectChanges();
  return { fixture, review, withdrawReview, changed: () => changed };
}

const el = (f: ComponentFixture<OrderReviewCard>) => f.nativeElement as HTMLElement;

describe('OrderReviewCard — la vérification d’une commande', () => {
  it('se tait quand le détail ne porte pas de visa', () => {
    expect(el(mount({ id: 'o1' }, WRITER).fixture).textContent).toBe('');
  });

  it('propose « Vérifier » sur une commande à vérifier, sous le droit seulement', () => {
    expect(el(mount(TO_REVIEW, WRITER).fixture).querySelector('[data-review]')).not.toBeNull();
    const reader = el(mount(TO_REVIEW, []).fixture);
    expect(reader.querySelector('[data-review]')).toBeNull();
    expect(reader.querySelector('[data-review-none]')).not.toBeNull();
  });

  it('vérifie avec la note saisie, sans les espaces, sous une clé d’intention', async () => {
    const { fixture, review, changed } = mount(TO_REVIEW, WRITER);
    fixture.componentInstance['note'].set('  RAS  ');
    await fixture.componentInstance['verify']();
    expect(review).toHaveBeenCalledWith('o1', 'RAS', expect.any(String));
    expect(changed()).toBe(1);
  });

  it('envoie une note vide comme « pas de note »', async () => {
    const { fixture, review } = mount(TO_REVIEW, WRITER);
    fixture.componentInstance['note'].set('   ');
    await fixture.componentInstance['verify']();
    expect(review).toHaveBeenCalledWith('o1', null, expect.any(String));
  });

  it('garde la clé après un refus, et affiche la phrase du serveur', async () => {
    const refused = new HttpErrorResponse({
      status: 409,
      error: { code: 'orders.review.already', message: 'Déjà vérifiée par Lou Martin.' },
    });
    const review = vi.fn((_id: string, _note: string | null, _key: string) =>
      Promise.reject(refused),
    );
    const { fixture, changed } = mount(TO_REVIEW, WRITER, review);
    await fixture.componentInstance['verify']();
    await fixture.componentInstance['verify']();
    fixture.detectChanges();
    expect(review.mock.calls[0]?.[2]).toBe(review.mock.calls[1]?.[2]);
    expect(changed()).toBe(0);
    expect(el(fixture).querySelector('[data-review-error]')?.textContent).toContain(
      'Déjà vérifiée par Lou Martin.',
    );
  });

  it('dit qui a vérifié, quand, et la note ; propose de retirer la vérification', async () => {
    const { fixture, withdrawReview } = mount(REVIEWED, WRITER);
    const root = el(fixture);
    expect(root.querySelector('[data-review-stamp]')?.textContent).toContain(
      'Vérifié par Lou Martin le',
    );
    expect(root.querySelector('[data-review-note]')?.textContent).toContain(
      'Quantités habituelles.',
    );
    expect(root.querySelector('[data-review]')).toBeNull();
    await fixture.componentInstance['withdraw']();
    expect(withdrawReview).toHaveBeenCalledWith('o1', expect.any(String));
  });

  it('dit « Vérifié » seul quand l’annuaire ne connaît plus l’auteur', () => {
    const anonymous = { ...STAMP, reviewedByName: null };
    const { fixture } = mount(
      {
        id: 'o1',
        review: {
          current: anonymous,
          revisedSinceReview: false,
          reviewable: false,
          history: [anonymous],
        },
      },
      WRITER,
    );
    expect(el(fixture).querySelector('[data-review-stamp]')?.textContent).toMatch(/^Vérifié le/);
  });

  it('dit qu’une commande a été modifiée depuis, et se vérifie à nouveau', () => {
    const { fixture } = mount(
      {
        id: 'o1',
        review: { current: STAMP, revisedSinceReview: true, reviewable: true, history: [STAMP] },
      },
      WRITER,
    );
    const root = el(fixture);
    expect(root.querySelector('[data-revised-since-review]')).not.toBeNull();
    expect(root.querySelector('[data-review]')).not.toBeNull();
  });
});

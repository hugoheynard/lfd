import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FoldBannerCarouselComponent } from './fold-banner-carousel';
import type { FoldBanner } from './fold-banner.model';

const A: FoldBanner = { id: 'a', title: 'A', cta: { label: 'Voir A', routerLink: '/a' } };
const B: FoldBanner = {
  id: 'b',
  title: 'B',
  secondaryActions: [{ label: 'Plus' }, { label: 'Info' }],
};
const C: FoldBanner = { id: 'c', title: 'C' };
const BANNERS: FoldBanner[] = [A, B, C];

describe('FoldBannerCarouselComponent', () => {
  let fixture: ComponentFixture<FoldBannerCarouselComponent>;
  let cmp: FoldBannerCarouselComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FoldBannerCarouselComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(FoldBannerCarouselComponent);
    cmp = fixture.componentInstance;
    fixture.componentRef.setInput('banners', BANNERS);
  });

  it('keeps array order when no lead is set', () => {
    expect(cmp.ordered().map((b) => b.id)).toEqual(['a', 'b', 'c']);
  });

  it('pins the referenced banner first via leadId', () => {
    fixture.componentRef.setInput('leadId', 'c');
    expect(cmp.ordered().map((b) => b.id)).toEqual(['c', 'a', 'b']);
  });

  it('resets the active slide to the lead when the order changes', () => {
    cmp.goTo(2);
    expect(cmp.activeIndex()).toBe(2);
    fixture.componentRef.setInput('leadId', 'b');
    expect(cmp.activeIndex()).toBe(0);
    expect(cmp.ordered().at(0)?.id).toBe('b');
  });

  it('advances and wraps with next/prev', () => {
    expect(cmp.activeIndex()).toBe(0);
    cmp.next();
    expect(cmp.activeIndex()).toBe(1);
    cmp.prev();
    cmp.prev();
    expect(cmp.activeIndex()).toBe(2); // wrapped past 0
  });

  it('goTo ignores out-of-range indexes', () => {
    cmp.goTo(99);
    expect(cmp.activeIndex()).toBe(0);
    cmp.goTo(2);
    expect(cmp.activeIndex()).toBe(2);
  });

  it('pauses on enter and resumes on leave', () => {
    expect(cmp.paused()).toBe(false);
    cmp.onEnter();
    expect(cmp.paused()).toBe(true);
    cmp.onLeave();
    expect(cmp.paused()).toBe(false);
  });

  it('shows the right controls for each mode', () => {
    fixture.componentRef.setInput('controls', 'dots');
    expect(cmp.showDots()).toBe(true);
    expect(cmp.showArrows()).toBe(false);

    fixture.componentRef.setInput('controls', 'both');
    expect(cmp.showDots()).toBe(true);
    expect(cmp.showArrows()).toBe(true);

    fixture.componentRef.setInput('controls', 'none');
    expect(cmp.showDots()).toBe(false);
    expect(cmp.showArrows()).toBe(false);
  });

  it('normalises actions: CTA first (primary), then secondaries', () => {
    const aRows = cmp.actionsFor(A);
    expect(aRows.map((r) => r.kind)).toEqual(['cta']);
    expect(aRows.every((r) => r.primary)).toBe(true);

    const bRows = cmp.actionsFor(B);
    expect(bRows.map((r) => r.kind)).toEqual(['secondary', 'secondary']);
    expect(bRows.every((r) => !r.primary)).toBe(true);

    expect(cmp.actionsFor(C)).toEqual([]);
  });

  it('emits the action event on activation', () => {
    const events: string[] = [];
    cmp.action.subscribe((e) => events.push(`${e.banner.id}:${e.kind}`));
    const [row] = cmp.actionsFor(A);
    if (row) {
      cmp.onAction(A, row);
    }
    expect(events).toEqual(['a:cta']);
  });
});

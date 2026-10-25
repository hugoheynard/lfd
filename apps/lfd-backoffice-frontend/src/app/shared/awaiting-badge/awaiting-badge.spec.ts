import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { AwaitingBadge } from './awaiting-badge';

@Component({
  imports: [AwaitingBadge],
  template: `<app-awaiting-badge [icon]="icon()" [waiting]="waiting()" [total]="total()" />`,
})
class Host {
  readonly icon = signal(true);
  readonly waiting = signal<number | null>(null);
  readonly total = signal<number | null>(null);
}

function render(icon: boolean, count: { waiting: number; total: number } | null): HTMLElement {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.icon.set(icon);
  fixture.componentInstance.waiting.set(count?.waiting ?? null);
  fixture.componentInstance.total.set(count?.total ?? null);
  fixture.detectChanges();
  const badge = (fixture.nativeElement as HTMLElement).querySelector('app-awaiting-badge');
  if (!(badge instanceof HTMLElement)) {
    throw new Error('badge absent');
  }
  return badge;
}

describe('AwaitingBadge — « Att. prod »', () => {
  it('sans compte, avec horloge : le badge du colisage, inchangé', () => {
    const badge = render(true, null);
    expect(badge.textContent?.trim()).toBe('Att. prod');
    expect(badge.querySelector('fold-icon')).not.toBeNull();
  });

  it('sans compte, sans horloge : le libellé seul', () => {
    const badge = render(false, null);
    expect(badge.textContent?.trim()).toBe('Att. prod');
    expect(badge.querySelector('fold-icon')).toBeNull();
  });

  it('avec compte et horloge : « Att. prod x/n »', () => {
    const badge = render(true, { waiting: 2, total: 5 });
    expect(badge.textContent?.trim()).toBe('Att. prod 2/5');
    expect(badge.querySelector('fold-icon')).not.toBeNull();
  });

  it('avec compte, sans horloge', () => {
    const badge = render(false, { waiting: 1, total: 3 });
    expect(badge.textContent?.trim()).toBe('Att. prod 1/3');
    expect(badge.querySelector('fold-icon')).toBeNull();
  });
});

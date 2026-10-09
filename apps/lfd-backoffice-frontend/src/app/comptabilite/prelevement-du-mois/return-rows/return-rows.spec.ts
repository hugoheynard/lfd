import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CollectionReturnView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { collectionReturn } from '../../__tests__/collection-return-fixture';
import { ReturnRows, type ReturnGestureEvent } from './return-rows';

function mount(
  returns: readonly CollectionReturnView[],
  canWrite = true,
): { fixture: ComponentFixture<ReturnRows>; emitted: ReturnGestureEvent[] } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(ReturnRows);
  const emitted: ReturnGestureEvent[] = [];
  fixture.componentInstance.gesture.subscribe((event) => emitted.push(event));
  fixture.componentRef.setInput('returns', returns);
  fixture.componentRef.setInput('canWrite', canWrite);
  fixture.detectChanges();
  return { fixture, emitted };
}

const host = (fixture: ComponentFixture<ReturnRows>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('ReturnRows', () => {
  it('re-présenter émet le geste quand le serveur l’admet', () => {
    const { fixture, emitted } = mount([collectionReturn()]);
    host(fixture).querySelector<HTMLButtonElement>('[data-represent]')?.click();
    expect(emitted.map((event) => event.gesture)).toEqual(['represent']);
  });

  it('re-présenter est grisé, et ses mots disent pourquoi', () => {
    const refused = collectionReturn({
      gestures: { representRefusal: 'le mandat n’est plus actif', proposesRevocation: true },
    });
    const { fixture } = mount([refused]);
    expect(host(fixture).querySelector<HTMLButtonElement>('[data-represent]')?.disabled).toBe(true);
    expect(host(fixture).querySelector('[data-represent-refusal]')?.textContent).toContain(
      'mandat n’est plus actif',
    );
  });

  it('un motif de mandat PROPOSE de révoquer, par la fiche du client', () => {
    const { fixture } = mount([
      collectionReturn({ gestures: { representRefusal: null, proposesRevocation: true } }),
    ]);
    expect(host(fixture).querySelector('[data-propose-revocation]')?.getAttribute('href')).toBe(
      '/comptes-clients/co_port/informations',
    );
  });

  it('un retour traité n’a plus de geste ; la lecture seule n’en a aucun', () => {
    const done = mount([collectionReturn({ resolution: 'represented', gestures: null })]);
    expect(host(done.fixture).querySelector('[data-represent]')).toBeNull();
    const reader = mount([collectionReturn()], false);
    expect(host(reader.fixture).querySelector('[data-represent]')).toBeNull();
  });
});

import { Component, ElementRef, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { revealLineOnce } from './workshop-reveal-line';

/** Un écran minimal : deux lignes `[data-line]`, et les signaux que l'écran réel passe. */
@Component({
  template: `
    @if (withLines()) {
      <div data-line="SEI"></div>
      <div data-line="BAG"></div>
    }
  `,
})
class Host {
  readonly sku = signal<string | null>(null);
  readonly ready = signal(false);
  readonly withLines = signal(true);

  constructor() {
    revealLineOnce(this.sku, this.ready);
  }
}

interface Mounted {
  readonly fixture: ComponentFixture<Host>;
  readonly host: Host;
  /** Les `data-line` sur lesquels `scrollIntoView` a été appelé, dans l'ordre. */
  readonly scrolled: string[];
  readonly flush: () => Promise<void>;
}

function mount(withLines = true): Mounted {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.withLines.set(withLines);
  fixture.detectChanges();
  const scrolled: string[] = [];
  // jsdom n'a pas `scrollIntoView` : on le pose sur chaque ligne pour l'observer.
  const root = fixture.debugElement.injector.get<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  for (const line of root.querySelectorAll<HTMLElement>('[data-line]')) {
    line.scrollIntoView = (): void => {
      scrolled.push(line.dataset['line'] ?? '');
    };
  }
  const flush = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, host: fixture.componentInstance, scrolled, flush };
}

describe('revealLineOnce', () => {
  it('amène la ligne désignée sous les yeux, elle et pas une autre', async () => {
    const { host, scrolled, flush } = mount();
    host.sku.set('BAG');
    host.ready.set(true);
    await flush();
    expect(scrolled).toEqual(['BAG']);
  });

  it("ne fait rien tant qu'aucune ligne n'est désignée", async () => {
    const { host, scrolled, flush } = mount();
    host.ready.set(true);
    await flush();
    expect(scrolled).toEqual([]);
  });

  it("ne fait rien tant que la fiche n'est pas connue, puis le fait quand elle l'est", async () => {
    const { host, scrolled, flush } = mount();
    host.sku.set('SEI');
    await flush();
    expect(scrolled).toEqual([]);
    host.ready.set(true);
    await flush();
    expect(scrolled).toEqual(['SEI']);
  });

  // La relecture périodique de la fiche ne ramène pas la personne qui a défilé ailleurs.
  it('une seule fois : ni la relecture ni un autre lien ne la refont', async () => {
    const { host, scrolled, flush } = mount();
    host.sku.set('SEI');
    host.ready.set(true);
    await flush();
    host.ready.set(false);
    await flush();
    host.ready.set(true);
    host.sku.set('BAG');
    await flush();
    expect(scrolled).toEqual(['SEI']);
  });

  it("ne plante pas quand la ligne n'est pas rendue, et ne le retente pas", async () => {
    const { host, scrolled, flush } = mount();
    host.sku.set('ABSENT');
    host.ready.set(true);
    await flush();
    expect(scrolled).toEqual([]);
    host.sku.set('SEI');
    await flush();
    expect(scrolled).toEqual([]);
  });

  it("ne plante pas quand aucune ligne n'est rendue du tout", async () => {
    const { host, scrolled, flush } = mount(false);
    host.sku.set('SEI');
    host.ready.set(true);
    await flush();
    expect(scrolled).toEqual([]);
  });
});

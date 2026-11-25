import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ReorderHandle, type ReorderStep } from './reorder-handle';

async function mount(): Promise<{
  fixture: ComponentFixture<ReorderHandle>;
  steps: ReorderStep[];
}> {
  TestBed.configureTestingModule({ imports: [ReorderHandle] });
  const fixture = TestBed.createComponent(ReorderHandle);
  fixture.componentRef.setInput('itemName', 'Boulangerie');
  const steps: ReorderStep[] = [];
  fixture.componentInstance.step.subscribe((step) => steps.push(step));
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, steps };
}

function press(fixture: ComponentFixture<ReorderHandle>, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  (fixture.nativeElement as HTMLElement).querySelector('button')?.dispatchEvent(event);
  return event;
}

describe('la poignée d’un élément réordonnable', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('est un bouton focusable qui nomme ce qu’il déplace', async () => {
    const { fixture } = await mount();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe(
      'Déplacer « Boulangerie » (flèches haut et bas)',
    );
    expect(button?.disabled).toBe(false);
  });

  it('flèche haut monte, flèche bas descend, et la page ne défile pas', async () => {
    const { fixture, steps } = await mount();
    const up = press(fixture, 'ArrowUp');
    press(fixture, 'ArrowDown');
    expect(steps).toEqual([-1, 1]);
    expect(up.defaultPrevented).toBe(true);
  });

  it('une autre touche ne déplace rien et garde son effet', async () => {
    const { fixture, steps } = await mount();
    const tab = press(fixture, 'Tab');
    expect(steps).toEqual([]);
    expect(tab.defaultPrevented).toBe(false);
  });

  it('le focus revient sur la poignée après le rendu qui a déplacé l’élément', async () => {
    const { fixture } = await mount();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    press(fixture, 'ArrowDown');
    fixture.detectChanges();
    await fixture.whenStable();
    TestBed.tick();
    expect(document.activeElement).toBe(button);
  });
});

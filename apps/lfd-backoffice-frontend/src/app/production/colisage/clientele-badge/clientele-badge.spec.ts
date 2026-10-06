import { TestBed } from '@angular/core/testing';
import type { PackingSheet } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ClienteleBadge } from './clientele-badge';

/** Le badge de clientèle : « Pro », « Public », ou rien quand on ne sait pas. */
function render(clientele: PackingSheet['clientele']): HTMLElement {
  const fixture = TestBed.createComponent(ClienteleBadge);
  fixture.componentRef.setInput('clientele', clientele);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ClienteleBadge', () => {
  it('dit « Pro » sur une commande passée pour une société', () => {
    const badge = render('pro').querySelector('fold-badge[data-clientele="pro"]');
    expect(badge?.textContent).toContain('Pro');
  });

  it('dit « Public » sur une commande sans société', () => {
    const badge = render('public').querySelector('fold-badge[data-clientele="public"]');
    expect(badge?.textContent).toContain('Public');
  });

  it('pose deux variantes sobres et distinctes : `info` pour le pro, `neutral` pour le public', () => {
    expect(render('pro').querySelector('fold-badge')?.classList.contains('info')).toBe(true);
    expect(render('public').querySelector('fold-badge')?.classList.contains('neutral')).toBe(true);
  });

  it("n'affiche rien quand la clientèle est inconnue", () => {
    expect(render(null).querySelector('fold-badge')).toBeNull();
  });
});

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NEW_VERSION } from '@lfd/front-ops';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NewVersionBanner } from './new-version-banner';

/** Le bandeau suit le signal de la veille, sur n'importe quel écran. */
function mount(newVersion: boolean): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: NEW_VERSION, useValue: signal(newVersion).asReadonly() }],
  });
  const fixture = TestBed.createComponent(NewVersionBanner);
  fixture.detectChanges();
  return fixture.nativeElement;
}

describe('NewVersionBanner', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('s’affiche quand une version neuve est en ligne', () => {
    const host = mount(true);
    expect(host.textContent).toContain('Une nouvelle version est disponible');
    expect(host.textContent).toContain('Finissez votre opération, puis rechargez la page.');
    expect(host.querySelector('button')?.textContent).toContain('Recharger');
  });

  it('reste muet tant qu’aucune version neuve n’est connue', () => {
    expect(mount(false).querySelector('fold-callout')).toBeNull();
  });

  it('recharge la page au clic sur « Recharger »', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    mount(true).querySelector('button')?.click();
    expect(reload).toHaveBeenCalledOnce();
  });
});

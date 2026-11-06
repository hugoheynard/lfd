import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { NEW_VERSION, NEW_VERSION_BANNER } from '@lfd/front-ops';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NewVersionBanner } from './new-version-banner';

@Component({ selector: 'app-blank', template: '' })
class Blank {}

/** Le bandeau suit le signal de la veille, sur les seuls écrans « bandeau ». */
async function mount(newVersion: boolean, url: string): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: NEW_VERSION, useValue: signal(newVersion).asReadonly() },
      provideRouter([
        { path: 'coursier', component: Blank, data: { newVersion: NEW_VERSION_BANNER } },
        { path: 'commandes', component: Blank },
      ]),
    ],
  });
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(NewVersionBanner);
  fixture.detectChanges();
  return fixture.nativeElement;
}

describe('NewVersionBanner', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('s’affiche sur un écran de terrain quand une version neuve est en ligne', async () => {
    const host = await mount(true, '/coursier');
    expect(host.textContent).toContain('Une nouvelle version est disponible');
    expect(host.querySelector('button')?.textContent).toContain('Recharger');
  });

  it('reste muet ailleurs : la version se prend à la navigation suivante', async () => {
    expect((await mount(true, '/commandes')).querySelector('fold-callout')).toBeNull();
  });

  it('reste muet tant qu’aucune version neuve n’est connue', async () => {
    expect((await mount(false, '/coursier')).querySelector('fold-callout')).toBeNull();
  });

  it('recharge la page au clic sur « Recharger »', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    (await mount(true, '/coursier')).querySelector('button')?.click();
    expect(reload).toHaveBeenCalledOnce();
  });
});

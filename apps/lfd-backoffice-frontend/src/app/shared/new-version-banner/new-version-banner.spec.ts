import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { NEW_VERSION, NEW_VERSION_BANNER } from '@lfd/front-ops';
import { describe, expect, it } from 'vitest';

import { NewVersionBanner } from './new-version-banner';

@Component({ template: '' })
class Blank {}

/**
 * Le bandeau ne s'affiche que si une version neuve est connue ET que l'écran
 * l'a demandé — partout ailleurs, la veille recharge à la navigation.
 */
async function mount(newVersion: boolean, url: string): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: NEW_VERSION, useValue: signal(newVersion).asReadonly() },
      provideRouter([
        { path: 'coursier', component: Blank, data: { newVersion: NEW_VERSION_BANNER } },
        { path: 'livraison', component: Blank },
      ]),
    ],
  });
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(NewVersionBanner);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement;
}

describe('NewVersionBanner', () => {
  it('s’affiche sur un écran à bandeau quand une version neuve est en ligne', async () => {
    const host = await mount(true, '/coursier');
    expect(host.textContent).toContain('Une nouvelle version est en ligne');
    expect(host.querySelector('button')?.textContent).toContain('Recharger');
  });

  it('reste muet tant qu’aucune version neuve n’est connue', async () => {
    const host = await mount(false, '/coursier');
    expect(host.querySelector('fold-callout')).toBeNull();
  });

  it('reste muet sur un écran qui recharge à la navigation', async () => {
    const host = await mount(true, '/livraison');
    expect(host.querySelector('fold-callout')).toBeNull();
  });
});

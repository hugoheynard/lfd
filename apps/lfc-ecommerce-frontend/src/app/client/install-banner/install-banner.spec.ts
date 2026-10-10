import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { INSTALL_NOW, InstallPrompt } from '../install-prompt.service';
import { InstallBanner } from './install-banner';

const NOW = 5_000_000_000;

function fakePromptEvent(prompt: () => Promise<void>): Event {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  return Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  });
}

async function mount(platform: 'browser' | 'server' = 'browser') {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: platform },
      { provide: INSTALL_NOW, useValue: () => NOW },
    ],
  });
  const prompt = TestBed.inject(InstallPrompt);
  prompt.listen();
  const fixture = TestBed.createComponent(InstallBanner);
  await fixture.whenStable();
  return { fixture, prompt, host: fixture.nativeElement as HTMLElement };
}

describe('InstallBanner — l’invitation à installer', () => {
  afterEach(() => localStorage.clear());

  it('au rendu serveur, rien n’est rendu même si une invite existe', async () => {
    const { fixture, host } = await mount('server');
    window.dispatchEvent(fakePromptEvent(() => Promise.resolve()));
    await fixture.whenStable();

    expect(host.querySelector('fold-callout')).toBeNull();
  });

  it('un refus mémorisé le garde caché', async () => {
    localStorage.setItem('lfc.install-dismissed-at', JSON.stringify(NOW - 1000));
    const { fixture, host } = await mount();
    window.dispatchEvent(fakePromptEvent(() => Promise.resolve()));
    await fixture.whenStable();

    expect(host.querySelector('fold-callout')).toBeNull();
  });

  it('« Installer » rejoue l’invite captée, une seule fois', async () => {
    const replay = vi.fn(() => Promise.resolve());
    const { fixture, host } = await mount();
    window.dispatchEvent(fakePromptEvent(replay));
    await fixture.whenStable();

    const buttons = host.querySelectorAll<HTMLButtonElement>('fold-callout button');
    expect(buttons[0]?.textContent).toContain('Installer');
    buttons[0]?.click();
    await fixture.whenStable();

    expect(replay).toHaveBeenCalledTimes(1);
    expect(host.querySelector('fold-callout')).toBeNull();
  });

  it('« Plus tard » ferme et mémorise le refus', async () => {
    const { fixture, host } = await mount();
    window.dispatchEvent(fakePromptEvent(() => Promise.resolve()));
    await fixture.whenStable();

    const later = host.querySelectorAll<HTMLButtonElement>('fold-callout button')[1];
    later?.click();
    await fixture.whenStable();

    expect(host.querySelector('fold-callout')).toBeNull();
    expect(localStorage.getItem('lfc.install-dismissed-at')).toBe(String(NOW));
  });
});

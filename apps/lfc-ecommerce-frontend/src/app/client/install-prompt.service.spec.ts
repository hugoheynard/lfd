import { describe, expect, it } from 'vitest';

import {
  detectInstallContext,
  INSTALL_DISMISS_DURATION_MS,
  type InstallEnvironment,
  isDismissalActive,
} from './install-prompt.service';

const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IOS_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1';
const IOS_FIREFOX =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15';
const IOS_EDGE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/129.0.2792.84 Mobile/15E148 Safari/605.1.15';
const IPADOS =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

function env(userAgent: string, over: Partial<InstallEnvironment> = {}): InstallEnvironment {
  return { userAgent, standalone: false, maxTouchPoints: 5, hasPromptEvent: false, ...over };
}

describe('detectInstallContext — le reniflage, isolé', () => {
  it('iOS Safari : le geste Partager', () => {
    expect(detectInstallContext(env(IOS_SAFARI))).toBe('ios-safari');
  });

  it.each([
    ['Chrome', IOS_CHROME],
    ['Firefox', IOS_FIREFOX],
    ['Edge', IOS_EDGE],
  ])('iOS %s : renvoie vers Safari', (_name, ua) => {
    expect(detectInstallContext(env(ua))).toBe('ios-other');
  });

  it('iPadOS, qui se déclare Macintosh, est reconnu par le tactile', () => {
    expect(detectInstallContext(env(IPADOS))).toBe('ios-safari');
    expect(detectInstallContext(env(IPADOS, { maxTouchPoints: 0 }))).toBe('none');
  });

  it('Android avec l’invite captée : le bouton Installer', () => {
    expect(detectInstallContext(env(ANDROID_CHROME, { hasPromptEvent: true }))).toBe('prompt');
  });

  it('Android sans invite : rien à proposer', () => {
    expect(detectInstallContext(env(ANDROID_CHROME))).toBe('none');
  });

  it.each([IOS_SAFARI, IOS_CHROME, ANDROID_CHROME])('déjà installée (standalone) : rien', (ua) => {
    expect(detectInstallContext(env(ua, { standalone: true, hasPromptEvent: true }))).toBe('none');
  });
});

describe('isDismissalActive — le refus tient quatre semaines', () => {
  const at = 1_000_000;
  it('aucun refus : rien ne cache', () => {
    expect(isDismissalActive(null, at)).toBe(false);
  });
  it('dans la fenêtre : caché', () => {
    expect(isDismissalActive(at, at + INSTALL_DISMISS_DURATION_MS - 1)).toBe(true);
  });
  it('au-delà : le bandeau revient', () => {
    expect(isDismissalActive(at, at + INSTALL_DISMISS_DURATION_MS)).toBe(false);
  });
});

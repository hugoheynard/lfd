import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, PLATFORM_ID, signal, type Signal } from '@angular/core';

/**
 * **Garder l'écran allumé tant que la page est ouverte** (API Screen Wake Lock).
 *
 * Pour les écrans de poste : une tablette posée au four ou au colisage, qu'on
 * ne touche pas pendant plusieurs minutes et qu'on ne rallume pas les mains
 * farinées. Toute page qui sert de poste l'appelle dans son constructeur ;
 * personne ne parle à `navigator.wakeLock` ailleurs.
 *
 * - Le navigateur libère le verrou dès que l'onglet est caché : on le
 *   redemande à chaque retour de l'onglet au premier plan.
 * - Le verrou est rendu quand l'écran est détruit : quitter le poste rend à
 *   l'appareil sa veille normale.
 * - Sans l'API (navigateur ancien, rendu serveur, test), ou si le navigateur
 *   refuse (batterie faible, page non sécurisée), rien n'échoue : l'appareil
 *   garde sa veille, et le signal rendu dit `false`.
 *
 * ⚠️ À appeler dans un contexte d'injection (constructeur) : la libération est
 * attachée au `DestroyRef` de l'écran.
 *
 * @returns `true` tant que le verrou est tenu.
 */
export function keepScreenAwake(): Signal<boolean> {
  const held = signal(false);
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return held.asReadonly();
  }
  const wakeLock = typeof navigator === 'undefined' ? undefined : navigator.wakeLock;
  if (wakeLock === undefined) {
    return held.asReadonly();
  }
  let sentinel: WakeLockSentinel | null = null;
  let destroyed = false;

  const request = async (): Promise<void> => {
    if (destroyed || sentinel !== null || document.visibilityState !== 'visible') {
      return;
    }
    try {
      const acquired = await wakeLock.request('screen');
      if (destroyed) {
        await acquired.release();
        return;
      }
      sentinel = acquired;
      held.set(true);
      acquired.addEventListener('release', () => {
        sentinel = null;
        held.set(false);
      });
    } catch {
      // Refus du navigateur : l'appareil garde sa veille normale, et `held` le dit.
      held.set(false);
    }
  };

  const onVisibility = (): void => void request();
  document.addEventListener('visibilitychange', onVisibility);
  void request();

  inject(DestroyRef).onDestroy(() => {
    destroyed = true;
    document.removeEventListener('visibilitychange', onVisibility);
    const current = sentinel;
    sentinel = null;
    if (current !== null) {
      void current.release();
    }
  });
  return held.asReadonly();
}

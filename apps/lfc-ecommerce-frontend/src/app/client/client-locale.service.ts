import { Injectable, signal } from '@angular/core';

/** Les trois langues de la station. */
export const LOCALES = [
  { code: 'fr', name: 'Français' },
  { code: 'en', name: 'English' },
  { code: 'it', name: 'Italiano' },
] as const;

export type LocaleCode = (typeof LOCALES)[number]['code'];

/**
 * La langue choisie par le visiteur.
 *
 * Il enregistre le choix ; les dictionnaires de la boutique le lisent
 * (`client-copy.service.ts`), et la commande le porte depuis A3 (vérifié le
 * 2026-10-18 — une phrase disait « il ne traduit rien »). Val d'Isère
 * est frontalière et anglophone — la langue est une question d'accueil, pas une
 * option de réglages, d'où sa place dans le chrome et non dans un menu.
 */
@Injectable({ providedIn: 'root' })
export class ClientLocale {
  readonly current = signal<LocaleCode>('fr');
}

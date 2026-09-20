import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

/** Seuils par défaut (jours d'attente d'activation) — avertissement, puis alerte. */
const DEFAULT_WARN_DAYS = 7;
const DEFAULT_ALERT_DAYS = 14;
const STORAGE_KEY = 'lfc.commercial.acquisition-thresholds';

/** Ramène un nombre à un entier ≥ 1 (un seuil sous 1 jour n'a pas de sens). */
function clampDays(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : DEFAULT_WARN_DAYS;
}

/**
 * Réglages **Acquisition** du commercial : les seuils (en jours d'attente
 * d'activation) qui font monter la couleur d'un créneau — neutre, puis
 * **avertissement** (ambre) à `warnDays`, puis **alerte** (rouge) à `alertDays`.
 *
 * Édités depuis le panneau de réglages, lus par le calendrier (via
 * `buildAcquisitionEvents`). Persistés en `localStorage` côté navigateur ; en
 * SSR, les défauts (le service ne touche jamais `localStorage` hors navigateur).
 */
@Injectable({ providedIn: 'root' })
export class AcquisitionSettingsService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Jours d'attente à partir desquels un créneau passe en ambre. */
  readonly warnDays = signal(DEFAULT_WARN_DAYS);
  /** Jours d'attente à partir desquels un créneau passe en rouge. */
  readonly alertDays = signal(DEFAULT_ALERT_DAYS);

  constructor() {
    this.restore();
  }

  setWarnDays(days: number): void {
    this.warnDays.set(clampDays(days));
    this.reconcile();
    this.persist();
  }

  setAlertDays(days: number): void {
    this.alertDays.set(clampDays(days));
    this.reconcile();
    this.persist();
  }

  /** Une alerte ne peut pas précéder l'avertissement : `alert` reste ≥ `warn`. */
  private reconcile(): void {
    if (this.alertDays() < this.warnDays()) {
      this.alertDays.set(this.warnDays());
    }
  }

  private persist(): void {
    if (!this.isBrowser) {
      return;
    }
    const snapshot = { warnDays: this.warnDays(), alertDays: this.alertDays() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }

  private restore(): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        const record = parsed as Record<string, unknown>;
        if (typeof record['warnDays'] === 'number') {
          this.warnDays.set(clampDays(record['warnDays']));
        }
        if (typeof record['alertDays'] === 'number') {
          this.alertDays.set(clampDays(record['alertDays']));
        }
        this.reconcile();
      }
    } catch {
      // Stockage illisible → on garde les défauts.
    }
  }
}

import { signal, type Signal } from '@angular/core';
import type {
  AmendCompanyMercurialePayload,
  MercurialeAmendmentPreviewView,
  PosedMercurialeView,
} from '@lfd/contracts';

/** Ce que l'avenant appelle au serveur — la part de `CompanyPricingService` qu'il lit. */
export interface AmendmentApi {
  previewAmendment(
    companyId: string,
    mercurialeId: string,
    payload: AmendCompanyMercurialePayload,
  ): Promise<MercurialeAmendmentPreviewView>;
  amend(
    companyId: string,
    mercurialeId: string,
    payload: AmendCompanyMercurialePayload,
    intentKey: string,
  ): Promise<unknown>;
}

/** La mercuriale amendée, et qui l'amende. */
export interface AmendmentTarget {
  readonly api: AmendmentApi;
  readonly companyId: Signal<string>;
  readonly mercuriale: Signal<PosedMercurialeView>;
}

/**
 * **L'aperçu du serveur d'un avenant** : l'état de la mercuriale à la date
 * d'effet et les prix d'après, avec le corps sur lequel il a été calculé —
 * « Après » ne le lit que s'il est à jour. L'échec de l'ouverture change le
 * sens de l'écran ; celui d'un recalcul laisse la saisie intacte.
 */
export class AmendmentPreview {
  readonly loadState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly view = signal<MercurialeAmendmentPreviewView | null>(null);
  /** Le corps sur lequel l'aperçu a été calculé ; `null` à l'ouverture. */
  private readonly key = signal<string | null>(null);
  readonly checking = signal(false);
  readonly failed = signal(false);

  constructor(private readonly target: AmendmentTarget) {}

  /** L'aperçu a-t-il été calculé sur ce corps ? */
  isFreshFor(body: AmendCompanyMercurialePayload | null): boolean {
    return body !== null && JSON.stringify(body) === this.key();
  }

  /** L'état de départ ; rend l'aperçu, ou `null` si la lecture a échoué. */
  async open(body: AmendCompanyMercurialePayload): Promise<MercurialeAmendmentPreviewView | null> {
    this.loadState.set('loading');
    try {
      const view = await this.call(body);
      this.view.set(view);
      this.key.set(null);
      this.loadState.set('ready');
      return view;
    } catch {
      this.loadState.set('error');
      return null;
    }
  }

  /** Relance l'aperçu sur la saisie ; `true` = il a répondu. */
  async refresh(body: AmendCompanyMercurialePayload): Promise<boolean> {
    this.checking.set(true);
    try {
      const view = await this.call(body);
      this.view.set(view);
      // La clé est le corps ENVOYÉ : si l'état de référence a bougé (autre
      // date, autre avenant), l'écart se recalcule et « Après » redevient local.
      this.key.set(JSON.stringify(body));
      this.failed.set(false);
      return true;
    } catch {
      this.failed.set(true);
      return false;
    } finally {
      this.checking.set(false);
    }
  }

  private call(body: AmendCompanyMercurialePayload): Promise<MercurialeAmendmentPreviewView> {
    return this.target.api.previewAmendment(
      this.target.companyId(),
      this.target.mercuriale().id,
      body,
    );
  }
}

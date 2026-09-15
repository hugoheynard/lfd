import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import type {
  CustomerMandateOptionsSectionView,
  CustomerMandateOptionsView,
  CustomerMandateView,
  MintBlocker,
  SepaScheme,
  SetMandateOptionsPayload,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';

/** Où en est la lecture du mandat. */
export type MandateReadStatus = 'loading' | 'failed' | 'ready';

/**
 * **Le mandat SEPA de la société**, tel que le client le génère, le télécharge
 * et le renvoie signé depuis `/mon-compte` (plan
 * `documentation/b2b/plan-mandat-client.md`, lot B ; contrat en fin de §9).
 *
 * Même forme que `ClientBankAccount` : **une** lecture partagée, parce que la
 * carte bureau et la carte mobile sont toutes deux dans le DOM, et le panneau
 * lit la même source — un scan déposé met les trois à jour d'un coup.
 *
 * Le client n'active rien : activer autorise un débit, et reste le geste du
 * commercial qui a relu la pièce. Le mur (détenteur ou facturation), le drapeau
 * `customerMandate` et les règles sont tenus par l'API ; l'écran ne fait que ne
 * pas proposer la carte à qui l'API refuserait.
 */
@Injectable({ providedIn: 'root' })
export class ClientMandate {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  private readonly _status = signal<MandateReadStatus>('loading');
  private readonly _mandate = signal<CustomerMandateView | null>(null);
  private readFor: string | null = null;

  readonly status = this._status.asReadonly();
  readonly mandate = this._mandate.asReadonly();

  private readonly _optionsStatus = signal<MandateReadStatus>('loading');
  private readonly _options = signal<CustomerMandateOptionsView | null>(null);

  /** Où en est la lecture des zones 14 et 19 — lue à l'ouverture de leur panneau seulement. */
  readonly optionsStatus = this._optionsStatus.asReadonly();
  /** Les zones facultatives, ou `null` tant qu'aucun RIB n'est déposé : elles vivent sur sa ligne. */
  readonly options = this._options.asReadonly();

  private readonly _issuerScheme = signal<SepaScheme | null>(null);

  /**
   * Le schéma des mandats que l'émetteur frappe — `null` tant qu'il n'est pas
   * lu, ou sans émetteur. Rendu par l'enveloppe des options : c'est là que le
   * serveur le sert (plan-mandat-deux-schemas §10.4).
   */
  readonly issuerScheme = this._issuerScheme.asReadonly();

  private readonly _mintBlockers = signal<readonly MintBlocker[]>([]);

  /**
   * Ce qui empêche aujourd'hui de générer le mandat — vide quand la génération
   * passerait, ou tant que l'enveloppe des options n'est pas lue. Calculé par le
   * serveur avec la fonction même qui refuse la génération : l'écran traduit,
   * il ne recompte pas.
   */
  readonly mintBlockers = this._mintBlockers.asReadonly();

  /**
   * Lit le mandat si ce n'est pas déjà fait. Paresseux, comme le RIB : seules
   * les cartes montrées le demandent, et elles ne le sont que drapeau ouvert —
   * une lecture drapeau fermé partirait en 409.
   *
   * Les options partent avec lui depuis le 2026-09-15 : leur enveloppe porte le
   * schéma de l'émetteur, et la carte en a besoin AVANT tout panneau — pour
   * taire « Options du mandat » en interentreprises, et pour dire ce que le
   * mandat à générer autorisera. Une requête de plus par ouverture de
   * `/mon-compte`, pas par élément.
   */
  ensure(companyId: string): void {
    if (this.readFor !== companyId) {
      void this.reload(companyId);
      void this.loadOptions(companyId);
    }
  }

  /** Relit : après un échec (« Réessayer »), ou après un dépôt. */
  async reload(companyId: string): Promise<void> {
    this.readFor = companyId;
    if (this._status() === 'failed') {
      this._status.set('loading');
    }
    try {
      const mandate = await firstValueFrom(
        this.http.get<CustomerMandateView | null>(this.url(companyId), {
          headers: await this.headers(),
        }),
      );
      this._mandate.set(mandate);
      this._status.set('ready');
    } catch {
      this._status.set('failed');
    }
  }

  /**
   * Relit **seulement si le mandat de cette société a déjà été lu**.
   *
   * Appelé après un RIB enregistré : l'API révoque alors le brouillon, dont le
   * papier nommerait un compte qui n'est plus le RIB (plan §8). Sans carte
   * montrée, il n'y a rien à rafraîchir — et une lecture drapeau fermé serait
   * refusée.
   */
  async refresh(companyId: string): Promise<void> {
    if (this.readFor === companyId) {
      // Les options AUSSI depuis le 2026-09-15 : leur enveloppe porte les
      // mentions manquantes, et un RIB ou une identité enregistrés les changent.
      await Promise.all([this.reload(companyId), this.loadOptions(companyId)]);
    }
  }

  /**
   * `POST` — génère le mandat, ou rend le brouillon qui attend déjà. La vue
   * rendue devient la lecture partagée.
   *
   * `null` au succès, le **message du serveur** au refus : il s'affiche dans le
   * panneau resté ouvert (même contrat que `AccountService.attempt`).
   */
  async generate(companyId: string): Promise<string | null> {
    try {
      const mandate = await firstValueFrom(
        this.http.post<CustomerMandateView>(this.url(companyId), null, {
          headers: await this.headers(),
        }),
      );
      this.readFor = companyId;
      this._mandate.set(mandate);
      this._status.set('ready');
      return null;
    } catch (error) {
      return httpErrorMessage(error);
    }
  }

  /**
   * `PUT …/proof` en multipart `file` (204) — le mandat signé, PDF ou photo.
   * Le statut ne change pas ; la relecture dit « en vérification ».
   */
  async attachProof(companyId: string, file: File): Promise<string | null> {
    const form = new FormData();
    form.append('file', file, file.name);
    try {
      await firstValueFrom(
        this.http.put(`${this.url(companyId)}/proof`, form, { headers: await this.headers() }),
      );
    } catch (error) {
      return httpErrorMessage(error);
    }
    await this.reload(companyId);
    return null;
  }

  /**
   * Le PDF nominatif du brouillon, en **blob** : la route est authentifiée, un
   * `<a href>` partirait sans jeton. `inline` le demande pour un onglet.
   */
  async document(companyId: string, inline: boolean): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${this.url(companyId)}/document.pdf`, {
        headers: await this.headers(),
        params: inline ? { inline: '1' } : {},
        responseType: 'blob',
      }),
    );
  }

  /** `GET …/mandate-options` — relue à chaque ouverture du panneau : c'est un réglage rare. */
  async loadOptions(companyId: string): Promise<void> {
    this._optionsStatus.set('loading');
    try {
      const { options, issuerScheme, mintBlockers } = await firstValueFrom(
        this.http.get<CustomerMandateOptionsSectionView>(this.optionsUrl(companyId), {
          headers: await this.headers(),
        }),
      );
      this._options.set(options);
      this._issuerScheme.set(issuerScheme);
      this._mintBlockers.set(mintBlockers);
      this._optionsStatus.set('ready');
    } catch {
      this._optionsStatus.set('failed');
    }
  }

  /**
   * `PUT …/mandate-options` (204), puis relit **le mandat et les options**.
   *
   * Le mandat parce qu'un brouillon en cours devient caduc côté serveur : ces
   * zones sont imprimées sur le papier (plan §9 #4). Refusé en 409 sous un
   * mandat actif, dont le papier signé les porte déjà
   * (`payments.mandate_options.bound_to_active_mandate`) — le message du
   * serveur est rendu tel quel.
   */
  async saveOptions(companyId: string, payload: SetMandateOptionsPayload): Promise<string | null> {
    try {
      await firstValueFrom(
        this.http.put(this.optionsUrl(companyId), payload, { headers: await this.headers() }),
      );
    } catch (error) {
      return httpErrorMessage(error);
    }
    await Promise.all([this.reload(companyId), this.loadOptions(companyId)]);
    return null;
  }

  private optionsUrl(companyId: string): string {
    return `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/mandate-options`;
  }

  private url(companyId: string): string {
    return `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/mandate`;
  }

  private async headers(): Promise<HttpHeaders> {
    const token = await firstValueFrom(this.auth.accessToken$());
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}

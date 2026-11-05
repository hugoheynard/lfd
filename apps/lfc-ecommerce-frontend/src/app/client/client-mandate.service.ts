import { HttpClient, HttpHeaders } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type {
  CustomerMandateOptionsSectionView,
  CustomerMandateOptionsView,
  CustomerMandateView,
  MintBlocker,
  SepaScheme,
  SetMandateOptionsPayload,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';
import { ClientContext } from './client-context.service';
import { contextKeyed, type ContextKey, workspaceRequestOf } from './context-keyed/context-keyed';

/** Où en est la lecture du mandat. */
export type MandateReadStatus = 'loading' | 'failed' | 'ready';

/**
 * **Le mandat SEPA de la société**, tel que le client le génère, le télécharge
 * et le renvoie signé depuis `/mon-compte` (plan
 * `documentation/comptabilite/mandat/plan-mandat-client.md`, lot B ; contrat en fin de §9).
 *
 * Même forme que `ClientBankAccount` : **une** lecture partagée, parce que la
 * carte bureau et la carte mobile sont toutes deux dans le DOM, et le panneau
 * lit la même source — un scan déposé met les trois à jour d'un coup.
 *
 * Le client n'active rien : activer autorise un débit, et reste le geste du
 * commercial qui a relu la pièce. Le mur (détenteur ou facturation), le drapeau
 * `customerMandate` et les règles sont tenus par l'API ; l'écran ne fait que ne
 * pas proposer la carte à qui l'API refuserait.
 *
 * Rangé par clé de contexte (lot d de `caching-usage/plan-espace-retenu.md`) :
 * l'espace d'une société EST son identifiant, et rien n'est rendu pour un
 * autre espace que celui que `ClientContext` affiche — après une bascule, le
 * mandat de la société quittée ne reste pas sous le nom de la suivante.
 */
@Injectable({ providedIn: 'root' })
export class ClientMandate {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly context = inject(ClientContext);

  /** Avance à chaque réponse ou échec : la brique n'est pas un signal. */
  private readonly answered = signal(0);
  /** L'espace dont la dernière lecture du mandat a échoué, `null` sinon. */
  private readonly failedSpace = signal<string | null>(null);
  /** L'espace dont la dernière lecture des options a échoué, `null` sinon. */
  private readonly optionsFailedSpace = signal<string | null>(null);
  /** L'espace dont les options se relisent : le panneau dit « chargement » à chaque ouverture. */
  private readonly optionsLoadingSpace = signal<string | null>(null);
  /**
   * La vue rendue par le `POST` de génération, tenue jusqu'à la lecture
   * suivante de son espace : la génération ne coûte pas une relecture.
   */
  private readonly generated = signal<{
    readonly space: string;
    readonly mandate: CustomerMandateView;
  } | null>(null);
  /** Les sociétés dont le mandat a été demandé — ce que `refresh` relit. */
  private readonly asked = new Set<string>();

  private readonly keyed = contextKeyed((key) =>
    this.withToken((token) =>
      this.http.get<CustomerMandateView | null>(this.url(key.workspace), this.readOf(key, token)),
    ),
  );
  private readonly optionsKeyed = contextKeyed((key) =>
    this.withToken((token) =>
      this.http.get<CustomerMandateOptionsSectionView>(
        this.optionsUrl(key.workspace),
        this.readOf(key, token),
      ),
    ),
  );

  /** Le mandat lu pour l'espace qui s'affiche — `undefined` s'il ne l'est pas encore. */
  private readonly shownMandate = computed<CustomerMandateView | null | undefined>(() => {
    this.answered();
    const space = this.context.prefix();
    if (space === null) {
      return undefined;
    }
    const generated = this.generated();
    return generated?.space === space ? generated.mandate : this.keyed.shown(keyOf(space));
  });

  /** L'enveloppe des options lue pour l'espace qui s'affiche, ou `undefined`. */
  private readonly shownOptions = computed<CustomerMandateOptionsSectionView | undefined>(() => {
    this.answered();
    const space = this.context.prefix();
    return space === null ? undefined : this.optionsKeyed.shown(keyOf(space));
  });

  readonly status = computed<MandateReadStatus>(() => {
    const space = this.context.prefix();
    if (space !== null && this.failedSpace() === space) {
      return 'failed';
    }
    return this.shownMandate() === undefined ? 'loading' : 'ready';
  });

  readonly mandate = computed<CustomerMandateView | null>(() => this.shownMandate() ?? null);

  /** Où en est la lecture des zones 14 et 19 — lue à l'ouverture de leur panneau seulement. */
  readonly optionsStatus = computed<MandateReadStatus>(() => {
    const space = this.context.prefix();
    if (space === null) {
      return 'loading';
    }
    if (this.optionsLoadingSpace() === space) {
      return 'loading';
    }
    if (this.optionsFailedSpace() === space) {
      return 'failed';
    }
    return this.shownOptions() === undefined ? 'loading' : 'ready';
  });

  /** Les zones facultatives, ou `null` tant qu'aucun RIB n'est déposé : elles vivent sur sa ligne. */
  readonly options = computed<CustomerMandateOptionsView | null>(
    () => this.shownOptions()?.options ?? null,
  );

  /**
   * Le schéma des mandats que l'émetteur frappe — `null` tant qu'il n'est pas
   * lu, ou sans émetteur. Rendu par l'enveloppe des options : c'est là que le
   * serveur le sert (mandat-deux-schemas).
   */
  readonly issuerScheme = computed<SepaScheme | null>(
    () => this.shownOptions()?.issuerScheme ?? null,
  );

  /**
   * Ce qui empêche aujourd'hui de générer le mandat — vide quand la génération
   * passerait, ou tant que l'enveloppe des options n'est pas lue. Calculé par le
   * serveur avec la fonction même qui refuse la génération : l'écran traduit,
   * il ne recompte pas.
   */
  readonly mintBlockers = computed<readonly MintBlocker[]>(
    () => this.shownOptions()?.mintBlockers ?? [],
  );

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
    this.asked.add(companyId);
    void this.settle(companyId, this.keyed.ensure(keyOf(companyId)));
    void this.settleOptions(companyId, this.optionsKeyed.ensure(keyOf(companyId)));
  }

  /** Relit : après un échec (« Réessayer »), ou après un dépôt. */
  async reload(companyId: string): Promise<void> {
    this.asked.add(companyId);
    if (this.failedSpace() === companyId) {
      this.failedSpace.set(null);
    }
    await this.settle(companyId, this.keyed.read(keyOf(companyId)));
  }

  /** Un échec est un ÉTAT : la dernière vue lue reste, l'écran dit qu'il n'a pas pu relire. */
  private async settle(
    companyId: string,
    reading: Promise<CustomerMandateView | null>,
  ): Promise<void> {
    try {
      await reading;
      // La lecture est plus récente que la vue de la génération.
      if (this.generated()?.space === companyId) {
        this.generated.set(null);
      }
      if (this.failedSpace() === companyId) {
        this.failedSpace.set(null);
      }
    } catch {
      this.failedSpace.set(companyId);
    }
    this.answered.update((count) => count + 1);
  }

  private async settleOptions(
    companyId: string,
    reading: Promise<CustomerMandateOptionsSectionView>,
  ): Promise<void> {
    try {
      await reading;
      if (this.optionsFailedSpace() === companyId) {
        this.optionsFailedSpace.set(null);
      }
    } catch {
      this.optionsFailedSpace.set(companyId);
    }
    if (this.optionsLoadingSpace() === companyId) {
      this.optionsLoadingSpace.set(null);
    }
    this.answered.update((count) => count + 1);
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
    if (this.asked.has(companyId)) {
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
      this.asked.add(companyId);
      this.generated.set({ space: companyId, mandate });
      if (this.failedSpace() === companyId) {
        this.failedSpace.set(null);
      }
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
    this.optionsLoadingSpace.set(companyId);
    if (this.optionsFailedSpace() === companyId) {
      this.optionsFailedSpace.set(null);
    }
    await this.settleOptions(companyId, this.optionsKeyed.read(keyOf(companyId)));
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

  /**
   * Une lecture porteuse du jeton. Le type de la réponse reste écrit à l'appel,
   * sur le type des contrats (`lint:api-types` ne suit pas un générique).
   */
  private withToken<V>(read: (token: string) => Observable<V>): Observable<V> {
    return this.auth.accessToken$().pipe(switchMap(read));
  }

  /** L'en-tête d'espace vient de la clé, pas de l'envoi. */
  private readOf(key: ContextKey, token: string): ReturnType<typeof workspaceRequestOf> {
    return workspaceRequestOf(key, { Authorization: `Bearer ${token}` });
  }

  private async headers(): Promise<HttpHeaders> {
    const token = await firstValueFrom(this.auth.accessToken$());
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}

/** La clé d'une société : son espace, sans part propre. */
function keyOf(companyId: string): ContextKey {
  return { workspace: companyId, own: '' };
}

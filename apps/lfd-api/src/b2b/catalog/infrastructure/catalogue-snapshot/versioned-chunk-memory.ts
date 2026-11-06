/** Un morceau gardé, et le numéro lu AVANT son chargement. */
interface Kept<T> {
  readonly version: bigint;
  readonly value: T;
}

/** Le chargement en vol, sous le numéro qui l'a demandé. */
interface Loading<T> {
  readonly version: bigint;
  readonly done: Promise<T>;
}

/**
 * **Un morceau de l'instantané, gardé sous SON numéro**
 * (`plan-materiaux-du-catalogue.md`, § 2.3).
 *
 * Les règles, toutes portées ici et éprouvées sans base :
 *
 * - **servi seulement sous le numéro exact** que la requête a lu — jamais un
 *   morceau d'un autre numéro, même plus récent : un montant ne se calcule pas
 *   sur un état que la requête n'a pas constaté ;
 * - **rangé sous le numéro lu AVANT son chargement** (la règle de
 *   `CachedPrincipalResolver`) : c'est l'appelant qui lit le numéro, puis
 *   demande ; le contenu est donc au moins aussi récent que son étiquette ;
 * - **une seule lecture en vol par numéro** : dix requêtes au même numéro
 *   attendent le même chargement ;
 * - **la borne** : le dernier morceau gardé, plus celui en cours de
 *   chargement. Un chargement d'un numéro plus ancien qu'un morceau gardé ne
 *   le remplace pas ;
 * - **numéro absent** (`null` : ligne absente de `context_versions`) : le
 *   morceau est relu, et rien n'est gardé ;
 * - une lecture qui échoue ne se garde pas : la suivante réessaie.
 */
export class VersionedChunkMemory<T> {
  private kept: Kept<T> | null = null;
  private loading: Loading<T> | null = null;

  /** Le morceau sous ce numéro, chargé au plus une fois. */
  of(version: bigint | null, load: () => Promise<T>): Promise<T> {
    if (version === null) {
      return load();
    }
    if (this.kept !== null && this.kept.version === version) {
      return Promise.resolve(this.kept.value);
    }
    if (this.loading !== null && this.loading.version === version) {
      return this.loading.done;
    }
    return this.lead(version, load);
  }

  /** Oublie tout — le harnais e2e, après la remise des numéros à 0. */
  forget(): void {
    this.kept = null;
    this.loading = null;
  }

  private lead(version: bigint, load: () => Promise<T>): Promise<T> {
    const done = load().then((value) => {
      if (this.loading === mine && (this.kept === null || this.kept.version < version)) {
        this.kept = { version, value };
      }
      return value;
    });
    const mine: Loading<T> = { version, done };
    this.loading = mine;
    // Le créneau se libère, réussite ou échec ; la promesse rendue garde son rejet.
    done.then(
      () => this.release(mine),
      () => this.release(mine),
    );
    return done;
  }

  private release(mine: Loading<T>): void {
    if (this.loading === mine) {
      this.loading = null;
    }
  }
}

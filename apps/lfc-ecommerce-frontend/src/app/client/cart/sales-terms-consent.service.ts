import { computed, inject, Injectable, signal } from '@angular/core';
import type { SalesTermsDocument } from '@lfd/contracts/content-values';
// Types seulement : rien du baril n'entre au démarrage (budget `cloudflare`).
import type { AcceptedSalesTerms } from '@lfd/contracts/shop-values';

import { ClientAudience } from '../client-audience.service';
import { ClientLegalDocuments } from '../client-legal-documents.service';
import {
  defaultSalesTermsSide,
  SALES_TERMS_SIDE_PARAM,
  salesTermsDocumentOf,
} from '../sales-terms-side';

/**
 * **La case des CGV du panier** (Hugo, 2026-10-26 : « une checkbox au panier :
 * j'accepte les CGV, et la référence de la version notée dans la commande »).
 *
 * Le texte est celui de la clientèle de l'écran (`ClientAudience`, la même
 * règle `audienceOf` que le serveur) ; sa révision est celle que la lecture du
 * texte a rendue (`ClientLegalDocuments`). C'est ce couple que la commande
 * envoie, et le serveur le confronte à ce qui est en vigueur (409 sinon).
 *
 * 🔴 **Cocher, c'est cocher UNE version.** On retient le texte et la révision
 * cochés, pas un booléen : une clientèle qui change (bascule d'espace) ou un
 * texte relu à une autre révision décochent d'eux-mêmes.
 *
 * Aucun texte publié pour cette clientèle (« en cours de rédaction », C1′) :
 * pas de case, et la commande part avec `null` — rien à accepter.
 */
@Injectable({ providedIn: 'root' })
export class SalesTermsConsent {
  private readonly audience = inject(ClientAudience);
  private readonly documents = inject(ClientLegalDocuments);

  private readonly checkedVersion = signal<AcceptedSalesTerms | null>(null);

  /** Le texte qui s'appliquerait à la commande de cet écran. */
  readonly document = computed<SalesTermsDocument>(() =>
    salesTermsDocumentOf(defaultSalesTermsSide(this.audience.shown())),
  );

  /** La version publiée de ce texte, ou `null` : rien à cocher (ou pas encore lu). */
  private readonly version = computed<AcceptedSalesTerms | null>(() => {
    const key = this.document();
    const revision = this.documents.publishedRevisionOf(key);
    return revision === null ? null : { key, revision };
  });

  /** La case paraît-elle ? Seulement devant un texte publié. */
  readonly asked = computed(() => this.version() !== null);

  /** La version affichée est-elle cochée ? */
  readonly checked = computed(() => sameVersion(this.checkedVersion(), this.version()));

  /** Le texte n'est pas encore lu : on ne sait pas encore s'il y a une case. */
  private readonly reading = computed(() => {
    const status = this.documents.statusOf(this.document());
    return status === 'idle' || status === 'loading';
  });

  /** Le bouton de commande attend : texte en lecture, ou case à cocher. */
  readonly blocking = computed(() => this.reading() || (this.asked() && !this.checked()));

  /** Le serveur a dit que la version avait changé : l'écran le dit jusqu'à la prochaine coche. */
  readonly outdated = signal(false);

  /** L'adresse de la page CGV, sur le côté de cette clientèle. */
  readonly pageQuery = computed(() => ({
    [SALES_TERMS_SIDE_PARAM]: defaultSalesTermsSide(this.audience.shown()),
  }));

  /** Lit le texte s'il ne l'est pas — appelé par le panier à son ouverture. */
  load(): void {
    this.documents.ensureLoaded(this.document());
  }

  /** Coche ou décoche la version affichée. */
  check(on: boolean): void {
    this.checkedVersion.set(on ? this.version() : null);
    if (on) {
      this.outdated.set(false);
    }
  }

  /** Ce que la commande envoie : la version cochée, ou `null` s'il n'y avait rien à cocher. */
  accepted(): AcceptedSalesTerms | null {
    return this.checked() ? this.checkedVersion() : null;
  }

  /**
   * Le serveur a refusé une version périmée (409) : on décoche, on relit le
   * texte, et l'écran le dit.
   */
  renew(): void {
    this.checkedVersion.set(null);
    this.outdated.set(true);
    this.documents.reload(this.document());
  }
}

function sameVersion(a: AcceptedSalesTerms | null, b: AcceptedSalesTerms | null): boolean {
  return a !== null && b !== null && a.key === b.key && a.revision === b.revision;
}

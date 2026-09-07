import { Injectable } from '@angular/core';
import { loadStripe, type Stripe } from '@stripe/stripe-js';

/**
 * **Le chargement de Stripe.js, isolé** — et c'est tout ce que fait ce service.
 *
 * Deux raisons, dont une seule est technique.
 *
 * 1. `loadStripe` injecte un `<script>` dans le document et ouvre des iframes.
 *    Rien de tout ça n'existe côté serveur, ni dans une suite de tests : un
 *    écran qui l'appelle directement n'est éprouvable qu'en vrai navigateur,
 *    donc jamais. C'est exactement ce qui est arrivé au composant de paiement
 *    `legacy/`, qu'aucun test ne traverse.
 * 2. La clé est **publique** (`pk_…`) et vient du serveur à chaque commande. La
 *    garder en paramètre plutôt qu'en configuration de bundle évite qu'un
 *    environnement se retrouve à présenter la carte d'un autre.
 *
 * Le service ne met rien en cache : `loadStripe` mémorise déjà son script, et
 * doubler cette mémoire ici ferait diverger deux caches pour aucun gain.
 */
@Injectable({ providedIn: 'root' })
export class StripeLoader {
  /** `null` quand le script n'a pas pu se charger — Stripe le rend ainsi. */
  load(publishableKey: string): Promise<Stripe | null> {
    return loadStripe(publishableKey);
  }
}

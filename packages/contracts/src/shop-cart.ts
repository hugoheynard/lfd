import { z } from "zod";

import { shopQuoteLineSchema } from "./shop-quote.js";

/**
 * **Le panier en cours d'une personne**, gardé chez nous et non dans son
 * navigateur.
 *
 * ## Ce que le `localStorage` ne pouvait pas faire
 *
 * Le panier de la boutique vivait sous une clé du navigateur. Trois choses en
 * découlaient, et aucune n'était un défaut de code :
 *
 * 1. **il ne traversait pas les appareils** — un panier composé sur le téléphone
 *    du matin n'existait pas sur l'ordinateur du bureau ;
 * 2. **un panier abandonné était invisible** — personne ne pouvait relancer ce
 *    que personne ne voyait ;
 * 3. **rien ne se mesurait** — ce qui est composé puis laissé est le signal
 *    commercial le plus dense d'une boutique, et il était jeté à chaque onglet
 *    fermé.
 *
 * ## Ce qu'il ne remplace pas
 *
 * 🔴 **La boutique reste visitable SANS être reconnu** — c'est une décision, pas
 * un oubli : `GET /shop/catalogue` et `POST /shop/quote` sont publics. Le
 * navigateur garde donc le panier de qui n'a pas de compte, et ce contrat ne
 * concerne que les autres. Un panier serveur pour un anonyme demanderait de lui
 * poser un identifiant durable avant qu'il n'ait rien demandé ; c'est un sujet
 * de consentement, pas de persistance.
 *
 * ## Les lignes, et pas l'acheminement
 *
 * Le mode de service reste dans le navigateur. Il porte des libellés d'affichage
 * — « Le Labo », « 7 h – 8 h » — qui rancissent : figés en base, ils
 * contrediraient le carnet d'adresses le jour où un point change d'horaire. Le
 * rendre reprenable demande d'y stocker une **identité** puis de réhydrater ses
 * libellés depuis les points de retrait. C'est un lot à part, et il n'a pas à
 * retarder celui-ci : le panier, ce sont les lignes.
 */

/**
 * Ce qui est mis de côté : des lignes, et rien d'autre.
 *
 * La même ligne que le devis (`shopQuoteLineSchema`) plutôt qu'un jumeau : ce
 * panier-là est exactement ce qu'on enverra chiffrer, et deux formes voisines
 * pour une même chose se seraient mises à diverger au premier champ ajouté.
 *
 * **Zéro ligne est un état de plein droit**, pas un panier qu'on effacerait :
 * « j'ai tout retiré sur mon téléphone » doit se voir sur l'ordinateur. Sans
 * cela, vider d'un côté laisserait l'autre plein, et la reprise multi-appareil
 * ne tiendrait que dans un sens.
 *
 * Bornées à cent lignes comme le devis, et pour la même raison : c'est la
 * charge qu'on accepte d'écrire, et un plafond découvert en production coûte
 * plus cher qu'un refus.
 */
export const shopCartPayloadSchema = z.object({
  lines: z.array(shopQuoteLineSchema).max(100).default([]),
});

export type ShopCartPayload = z.infer<typeof shopCartPayloadSchema>;

/**
 * Le panier **relu**, avec la date de son dernier enregistrement.
 *
 * `savedAt` n'est pas décoratif : c'est lui qui rend un panier *abandonné*
 * reconnaissable, et c'est la seule donnée que ce contrat ajoute à ce qui a été
 * écrit.
 */
export interface ShopCartView extends ShopCartPayload {
  /** ISO du dernier enregistrement. */
  readonly savedAt: string;
}

/**
 * La lecture du panier — **enveloppée**, comme le brouillon du back-office.
 *
 * « Aucun panier » est une réponse ordinaire et non une ressource absente : un
 * 404 obligerait chaque appelant à traiter une erreur pour le cas le plus
 * fréquent, celui d'une première visite. Et un corps `null` nu se sérialise en
 * corps **vide**, que le client relit en `{}` — un objet qui ressemble à un
 * panier sans en être un.
 */
export interface ShopCartResponse {
  readonly cart: ShopCartView | null;
}

# Plan — chaque audience ne reçoit que son information

> 📝 **Plan du 2026-10-31**, règle de Hugo du même jour. Déplace une
> **frontière de sécurité** (ce qu'une route publique sert) : `vitruve` avant
> le bâti. Rien n'est bâti.

## 1. La règle (Hugo, 2026-10-31)

> « Je veux que chaque audience n'ait le droit qu'à son information. »

Précisée le même jour (option a) : la **vitrine pro** est publique par
choix — un lien direct non référencé, donné aux prospects pros, qui montre le
tarif pro de liste et les remises de retrait et de livraison qu'ils auront
une fois connectés. Donc :

- **Public par choix** : le tarif pro de liste et les remises de points pour
  qui demande la vue pro ; le tarif public et les remises des particuliers
  pour tous.
- **Mais une seule part par appel** : un appel ne reçoit que l'information
  de l'audience qu'il demande (ou que son principal établit) — jamais les
  trois clientèles d'un coup.
- **Établi, jamais déclaré** : la clientèle « pros en cours d'inscription »
  ne sort que pour une personne connectée dont la société est en attente.
- **Jamais public** : ce qui est propre à un client — mercuriale, remise
  réservée à une société ou à ses sites, conditions négociées.

## 2. Ce que l'inventaire a trouvé (2026-10-31, partiel)

1. **`GET /pickup-addresses`** (`pickup-addresses/http/pickup-addresses.controller.ts:48-72`,
   `@Public()`) : chaque point porte `discounts` avec les trois clientèles
   (`b2b`, `b2bPending`, `b2c`), calculées sans dépendre de l'appelant
   (`promotions/domain/pickup-discount-announcement.ts:83-93`,
   `announced-pickup-address.repository.ts:46-50`) ; `?audience=pro` ne filtre
   que la liste des points. Le front n'en lit qu'une
   (`client/shop/pickup-discount.ts`), les autres restent dans le réseau.
2. **`GET /shop/catalogue?audience=pro`** (`catalog/http/shop-catalogue.controller.ts:78-92`) :
   tarif pro de liste à un anonyme, sans mercuriale ni société — **conforme**
   (vitrine pro, décision du 2026-10-19).
3. **États par clientèle sans prix** (`/delivery-availability`,
   `/order-opening`, `/fulfillment-days`) : servis aux deux clientèles —
   **admis** (aucune condition commerciale).
4. **Non vérifiés** : les offres de rayon d'un invité
   (`shelf-promotion-offers.ts` : une promotion « inscrits » ou « pros »
   peut-elle sortir ?), `GET /contact-settings` (les deux cartes ?), les CGV
   par clientèle, `/shop/cart`, `/shop/quote`, `/vitrine/catalogue`,
   `/shop/storefront/:shelfKey`, `/shop/suggestions/*`, `/shop/audience`.

## 3. Ce qui change

- **`GET /pickup-addresses` rend UNE remise par point**, celle de
  l'audience de l'appel : principal résolu → sa clientèle (pro actif, pro en
  attente, particulier) ; anonyme → `?audience=pro` donne la remise pro
  (vitrine), sinon celle des particuliers. Le contrat passe de
  `AnnouncedPickupDiscounts` (trois champs) à une remise unique
  (`discount: AudiencePickupDiscount | null`) — cassé dans le même
  déploiement (pré-release). La route lit le principal s'il y en a un
  (`@Public()` avec principal optionnel — à vérifier qu'il existe).
- **Front** : les lecteurs (`pickup-discount.ts`, `public-house-picker-dialog.ts`,
  `pro-landing.ts`, `accueil-public.ts`, `cart-dialog.ts`, `order-bar.ts`)
  lisent la remise unique ; la clé d'annonce côté client
  (`ClientAudience.announcement`) disparaît : le serveur a déjà choisi.
- **Vérifier les points non vérifiés du § 2.4**, corriger toute fuite de
  même nature dans le même lot (même principe : une part par appel), ou la
  lister pour Hugo si elle demande une décision.
- **Une porte** (si elle se laisse écrire) : aucune vue servie à une route
  `@Public()` ne porte un champ indexé par clientèle (`b2b`/`b2c`/`pro`/…).

## 4. Les tests

- Anonyme sans audience : remise particuliers seulement ; `?audience=pro` :
  remise pro seulement ; pro connecté : la sienne ; société en attente : la
  sienne ; jamais deux.
- Régression nommée : « un visiteur ne reçoit plus la remise des autres
  clientèles ».
- Rayon d'un invité : aucune promotion « inscrits » ou « pros » dans ses
  mentions (si le § 2.4 le révèle).

## 5. Après vitruve (2026-10-31) — fait foi sur le § 3

1. **Deux routes, pas de principal optionnel** : une route `@Public()` ne
   résout aucun principal (`platform/auth/auth.guard.ts:42-44`) et le garde
   global ne change pas. La route publique `GET /pickup-addresses` ne sert
   que deux audiences **déclarées** — particuliers par défaut, `?audience=pro`
   (vitrine) ; `listQuerySchema` reste `z.enum(["pro"])`. La route
   **`GET /pickup-addresses/mine`** (existe déjà, `orders/http/my-pickup-addresses.controller.ts`,
   appelée par le front connecté, `client/shop/pickup-list.gateway.ts`) sert
   l'audience **établie** (pro actif, pro en attente, particulier inscrit).
2. **Le type partagé ne bouge pas** : `PickupAddressView.discounts` (trois
   clientèles) reste pour le back-office (sites, promotions, nouvelle
   commande, modifier commande). Les deux routes de la boutique rendent une
   **vue distincte** `AudiencePickupAddressView { …, discount }`, fabriquée à
   partir de la clé d'audience (`pickup-discount-scope.ts`, choix
   `b2b`/`b2bPending`/`b2c`) — la vue publique n'a structurellement aucun
   champ par clientèle.
3. **Front** : tous les lecteurs de `AnnouncedPickupDiscounts` / de la clé
   `announcement` côté boutique passent à la remise unique (une trentaine
   d'occurrences hors specs ; dont `pickup-points.store.ts`,
   `pro-pickup-list.gateway.ts`, `legacy/…/acheminement-section.ts`) ; le
   store `pickup-points` se vide au changement de lecteur (connexion,
   déconnexion).
4. **Pas de porte statique** (non écrivable sans analyseur de types) : un
   **e2e par route publique** qui sérialise la réponse et vérifie l'absence
   des clés `b2b`, `b2bPending`, `b2c` ; `?audience=pending` rend 400.
5. **Périmètre du lot** : les points de retrait (public et `/mine`), et
   l'**ouverture** des routes non vérifiées du § 2.4 (`contact-settings`,
   CGV, `/shop/cart`, `/shop/quote`, `/vitrine/catalogue`, storefront,
   suggestions, `/shop/audience`, `/shop/featured`) : une fuite de même
   nature (plusieurs clientèles dans une réponse) se corrige dans le lot par
   la même forme ; une fuite d'une autre nature se liste pour Hugo.
6. Aucun cache dans la passerelle (vérifié), aucun SSR (boutique en
   `outputMode: static`).
7. Le JSDoc de `pickup-addresses.controller.ts` qui disait l'exposition
   acceptable est corrigé dans le même commit ; citer `announcedFor`, pas des
   lignes.

# Plan — la remise de retrait et la livraison, par clientèle

> ⚠️ **2026-10-09 : la clé `publicDelivery` est retirée** (Hugo). La livraison
> aux particuliers ne dépend plus que de la case « B2C » de « Livraison » ; les
> mentions de la clé plus bas (D4, D7, D8, Q4) décrivent l'état d'avant.
>
> **Statut : ✅ bâti — lots A (serveur), B (back-office) et C (boutique).
> Relu contre le code le 2026-10-07** (audit du dossier `livraisons/` de ce
> jour, §4.2). Le lot A depuis le 2026-09-15 : migration, `PickupDiscount`,
> `CartAdjustments` par clientèle, module `delivery-availability`. B et C
> vérifiés le 2026-09-16 : les trois pages de `/b2b/reglages/` (`04e0d15a`,
> puis cinq commits d'affinage), et `pickupOffer` qui lit `pickupDiscountFor`
> côté boutique. Touche **l'argent** (la remise appliquée au panier) et porte
> une **migration**. **Contredit par `vitruve` le 2026-09-15** (§7) : le
> `BLOQUANT` est tranché par Hugo le même jour (Q3 : société **active**
> seulement).
>
> **Ce que la relecture du 2026-10-07 a trouvé**, et où c'est corrigé :
>
> - **La porte du coursier ne suivait plus le réglage « Livraison »** depuis
>   le 2026-09-21 (`c71efb5b5`) : seul le refus 409 du serveur tenait la
>   règle. Corrigé le 2026-10-07 (B5) — D7.
> - **Une seconde clé gouverne la livraison des particuliers et des
>   visiteurs** : `publicDelivery`, fermée par défaut. Cocher « B2C » dans
>   « Livraison » ne suffit pas à la leur ouvrir — D4, D8.
> - **L'écran de commande staff n'est pas « toujours B2B »** : il suit le
>   statut de la société — D6.
> - **Les écrans ont bougé** : le point de retrait a sa page, la carte
>   « Livraison » s'enregistre par un bouton, `/reglages` ouvre sur
>   Facturation, `/livraison` est la feuille de route — D6.
> - **Q4 (§6) tranchée et bâtie le 2026-10-07** : la clé vaut aussi pour un
>   particulier connecté.
>
> Le §1 est l'état d'**avant** le chantier, et n'est plus tenu à jour.
>
> Lu avant : [`espace-de-travail.md`](../../b2b/comptes-client/espace-de-travail.md) (l'espace
> perso ou pro, bâti le même jour) et
> [`analyse-boutique-publique.md`](../../b2b/analyse-boutique-publique.md), dont ce plan
> **remplace** deux propositions (§2, D8).

## 0. La demande

Hugo, le 2026-09-15 : dans le back-office,

1. la **réduction d'un point de retrait** précise à qui elle s'applique :
   **B2B**, **B2C**, ou les deux ;
2. une **carte « Livraison »** regroupe les zones de livraison **et** deux cases
   **B2B / B2C** : proposer la livraison à l'une ou l'autre clientèle devient un
   choix de l'admin ;
3. la page « Retraits & livraisons » se **découpe en trois pages** — Points de
   retrait, Livraison, Heures limites de commande — rangées dans une sous-section
   **« Réglages »** du menu de l'espace **B2B**, renommé **« E-commerce LFC »**.

## 1. L'existant (ouvert et vérifié le 2026-09-15)

> ⚠️ **État d'avant le chantier (2026-09-15)**, gardé tel quel : ce tableau
> parle au présent du 2026-09-15, pas d'aujourd'hui. Ce qui a changé depuis est
> dans l'en-tête et les décisions (§2). Seuls les pointeurs devenus morts ont
> été repointés, le 2026-10-07.

| Fait                                                                                                                                                                                                                                                                                                                                            | Où                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La remise d'un point est `discount_mode` + `discount_value` sur `pickup_addresses` ; les frais d'une zone, `fee_mode` + `fee_value` sur `delivery_zones`. Aucune notion de clientèle                                                                                                                                                            | `apps/lfd-api/prisma/schema/public/settings.prisma`                                                                                                                                                  |
| **Un seul endroit** applique remise et frais : `CartAdjustments.forPickup` / `forDelivery`                                                                                                                                                                                                                                                      | `apps/lfd-api/src/b2b/orders/application/services/cart-adjustments.service.ts`                                                                                                                       |
| Ses deux appelants : le devis de la boutique et la composition de la commande. Tous deux connaissent la société agissante (`companyId`, `null` sans société)                                                                                                                                                                                    | `b2b/orders/application/services/shop-cart-quoting.service.ts` (le devis ; `quote-shop-cart.handler.ts` y délègue depuis le 2026-09-27), `b2b/orders/application/services/order-drafting.service.ts` |
| Le devis anonyme (`POST /shop/quote`) passe `companyId = null` ; le devis reconnu et `POST /orders` lisent `@ActingCompany()`, `null` en perso                                                                                                                                                                                                  | `b2b/orders/http/`                                                                                                                                                                                   |
| Une commande **saisie par le staff** exige une société et un rattachement de l'acheteur (`ensureOrderMember`)                                                                                                                                                                                                                                   | `b2b/orders/application/commands/place-order-for-customer.handler.ts`                                                                                                                                |
| Points et zones sont des CRUD honnêtes (port `create`/`update`, pas d'agrégat) ; chaque écriture publie un fait journalisé (`pickup_address.updated`, `delivery_zone.updated`), éprouvé par une spec                                                                                                                                            | `b2b/pickup-addresses/`, `b2b/delivery-zones/`, `b2b/delivery-zones/application/__tests__/commercial-settings-facts.spec.ts`                                                                         |
| Les listes `GET /pickup-addresses` et `GET /delivery-zones` sont **publiques** et déjà servies à un front en ligne                                                                                                                                                                                                                              | `b2b/pickup-addresses/http/`, `b2b/delivery-zones/http/`                                                                                                                                             |
| Aucun modèle de réglage commercial global n'existe : `settings.prisma` ne porte que `PickupAddress`, `DeliveryZone`, `PlatformContent` (textes de vitrine). Le précédent d'un réglage audité avec son auteur figé est `FeatureAccessOverride`                                                                                                   | `prisma/schema/public/settings.prisma`, `prisma/schema/public/feature-access.prisma`                                                                                                                 |
| Back-office : une page « Retraits et livraisons » — carte des points, section des zones, section des heures limites ; la réduction se saisit par `lfd-price-alteration-field` dans le panneau du point                                                                                                                                          | apps/lfd-backoffice-frontend/src/app/reglages/retraits-livraisons/ (supprimé le 2026-09-15, D6)                                                                                                      |
| Boutique : la remise se lit sur la carte « Je passe le prendre » et dans le dialogue de retrait ; la livraison s'ouvre par la carte « On vous l'apporte » et son dialogue d'adresse. ⚠️ Elle se lisait AUSSI dans le bloc pro de « Mon espace » — écran supprimé le 2026-09-21, l'accueil `/bienvenue` répondant désormais pour les trois états | `apps/lfc-ecommerce-frontend/src/app/client/shop/pickup-discount.ts`, client/nouvelle-commande/commande-page/ (supprimé le 2026-09-21, `c71efb5b5`)                                                  |
| Le rail du back-office déclare l'espace `b2b` (titre « B2B ») et ses vues par section (`Catalogue`, `Tarification`, `Contenu`) ; ses pages vivent sous `/b2b`, gardées par `b2b_settings:read`                                                                                                                                                  | `apps/lfd-backoffice-frontend/src/app/shared/workspace-rail/workspaces.ts`, `apps/lfd-backoffice-frontend/src/app/b2b/b2b.routes.ts`                                                                 |
| « Retraits & livraisons » est un onglet de la page `/reglages` (avec Surtaxe de retard, Facturation, Commercial), et il porte **trois** cartes : points, zones, heures limites. Ses services sont importés par l'écran de commande staff et la fiche client                                                                                     | `apps/lfd-backoffice-frontend/src/app/reglages/reglages.routes.ts`, `reglages/reglages-page.ts`, reglages/retraits-livraisons/ (supprimé)                                                            |
| Une page `/livraison` (« À venir ») renvoie vers `/reglages/retraits-livraisons`                                                                                                                                                                                                                                                                | `apps/lfd-backoffice-frontend/src/app/livraison/livraison-page/livraison-page.html`                                                                                                                  |
| L'espace courant est connu du front (`ClientWorkspace`) : perso, ou une société                                                                                                                                                                                                                                                                 | `client/client-workspace.service.ts`                                                                                                                                                                 |
| L'analyse de la boutique publique proposait « pas de remise de retrait pour le public » (D2) et « retrait seul pour le public » (D5)                                                                                                                                                                                                            | `documentation/b2b/analyse-boutique-publique.md` §6                                                                                                                                                  |

## 2. Décisions

**D1 — La clientèle d'une requête** (confirmé par Hugo le 2026-09-15 : « B2B une
société, B2C visiteur ou perso »). **B2B** quand une société agit ; **B2C** pour
un visiteur et en perso — y compris une personne sans société. Une commande
saisie par le staff suit la même règle : B2B si la société est active, B2C sinon (Q3). La clientèle se **déduit** de ce que le
serveur résout déjà, par une fonction pure unique `audienceOf(…)` ; elle ne se
déclare jamais, ni dans un corps ni dans un en-tête.

🔴 **Une société ACTIVE seulement** (Hugo, 2026-09-15, Q3). Déclarer une société
ne demande aucune vérification (`POST /companies` sans garde de rôle, société
créée `pending` **avec** son rattachement, agissante dès qu'elle est seule —
vitruve, B1). La clientèle est donc **B2B si la société agissante est `active`**,
**B2C** sinon : `pending`, `suspended` et `terminated` suivent les règles B2C pour
la remise et la livraison. Le statut se lit côté serveur, au devis comme à la
commande (`OrderGuardReader` le lit déjà à la passation).

**D2 — La remise d'un point porte ses clientèles.** Deux colonnes
`discount_for_b2b` et `discount_for_b2c`, `BOOLEAN NOT NULL DEFAULT true` sur
`pickup_addresses` : le défaut **reproduit l'existant**, où toute requête reçoit
la remise.

- **Création** (`POST`) : `discountAudiences` facultatif, défaut les deux à
  `true`.
- **Modification** (`PATCH`) : **absent = inchangé**, jamais « les deux à `true` »
  — sinon un onglet du back-office ouvert avant le déploiement rouvrirait en
  silence une remise fermée au public (vitruve, S2). Le schéma du `PATCH` perd
  donc son défaut.
- **La règle vit dans le domaine**, dans un value object `PickupDiscount`
  (ajustement + clientèles) : une réduction **non nulle** qui ne vise aucune
  clientèle est refusée (`DomainError`, 400, « Cochez au moins une clientèle, ou
  retirez la réduction »). **Sans réduction, les cases ne sont pas lues** : elles
  sont conservées telles quelles, et `{false, false}` avec `discount: null` est
  valide. Un value object, pas un agrégat : une seule règle, sans transition.

**D3 — Le serveur applique, à un seul endroit.** `forPickup(id, subtotal,
audience)` rend la remise seulement si la clientèle en fait partie ; sinon
`discountCents = 0` et `discountAdjustment = null` — ce qui est **figé** sur la
commande, comme aujourd'hui. Vitruve l'a vérifié : **aucun chemin** ne compose
remise ou frais hors de `CartAdjustments` (un seul `Order.draft`, estimation
staff au sous-total, abonnements sans commande générée, empreinte d'idempotence
qui porte déjà la société).

**D4 — La livraison ouverte par clientèle : un réglage, pas une zone.**

- Table `delivery_settings`, **une ligne** à clé naturelle (précédent
  `PlatformContent`) : `open_to_b2b`, `open_to_b2c`, l'instant du geste
  (`Clock`) et son auteur figé — fiche staff, nom, rôle (précédent
  `FeatureAccessOverride`). L'auteur s'écrivait en `sub` à l'origine : c'est
  l'id de fiche depuis le 2026-09-18, dans `updated_by_staff_id` (modèle
  `DeliveryAvailability`, `settings.prisma`). La ligne porte aussi, depuis, le
  mode créneau / échéance (`window_mode`, plan composition automatique, CA-D2)
  et les deux marges de production (`delivery_margin_minutes`,
  `pickup_margin_minutes`, plan production par vagues, §7.3).
- **Ligne absente = ouverte aux deux**, sans semis ; la vue rend alors
  `updatedAt: null`, `updatedBy: null`.
- Routes : `GET` et **`PATCH`** `/admin/delivery-availability` (comme les réglages
  voisins), `GET /delivery-availability` public.
- Fait journalisé `delivery_availability.updated`, **et son préfixe ajouté** au
  classement du journal (`b2b/growth/domain/activity-module.ts`, rangé sous
  `commandes` avec les zones et les points) — sinon le fait n'apparaît dans aucun
  filtre (vitruve, S6).
- 🔴 **La constante `DELIVERY_SERVICE_OPEN` disparaît** (`@lfd/b2b-ui/flags`, retirée le 2026-09-15) :
  seconde source de vérité, lue par les préférences d'acheminement de Mon compte,
  la fiche client staff et des écrans `legacy/`. Tous lisent le réglage — en
  **B2B**, puisque ce sont des contextes de société. Sans ça, une livraison fermée
  resterait choisissable comme préférence, puis refusée à la commande (vitruve,
  S4).

✅ **Ce réglage est la seule clé de la livraison depuis le 2026-10-09.** Du
2026-09-21 au 2026-10-09, une clé d'accès `publicDelivery` (« Livraison aux
particuliers », fermée par défaut) la doublait pour les particuliers et les
visiteurs : `POST /shop/orders` et, depuis le 2026-10-07, `POST /orders`
(`PublicDeliveryGate`) refusaient en 409 `PublicDeliveryClosedError`, et la
boutique cachait la porte du coursier. Hugo l'a **retirée le 2026-10-09** :
deux réglages pour une même porte se contredisaient, et cocher « B2C » ne
suffisait pas à ouvrir. Le refus des particuliers est désormais celui de D5,
au devis comme aux deux passations (`CartAdjustments.forDelivery`, appelé par
`OrderDrafting` pour `POST /orders` et `POST /shop/orders`). Les passages
ci-dessous qui parlent de la clé décrivent l'état d'avant cette date.

**D5 — Une livraison fermée se refuse au serveur.** `forDelivery(codePostal,
subtotal, audience)` lève `DeliveryClosedForAudienceError` (`BusinessError`, 409)
au devis comme à la commande. **Un message, sans condition** : « La livraison
n'est pas proposée pour cet espace. Choisissez le retrait. » — aucun de ces
chemins ne connaît les rattachements, et la variante « basculez sur votre
société » n'avait personne pour la composer (vitruve, S5). Ce refus est un
**garde** : la boutique ne propose pas la livraison fermée (D7). Le devis, qui
avale aujourd'hui toute erreur (`shop-quote.service.ts`), **montre ce refus-là**
au lieu de garder l'ancien décompte, frais de coursier compris.

**D6 — Le back-office : trois pages dans « E-commerce LFC → Réglages ».**

- **Le rail.** L'espace `b2b` prend le titre **« E-commerce LFC »** — le libellé
  seul : la clé et les adresses `/b2b/…` restent (précédent `journee` /
  « Fournée du jour ») ; le titre de route `B2B — LFC B2B admin` suit. Une
  section **« Réglages »** après « Contenu », trois vues sous `b2b_settings:read` :

  | Vue                        | Adresse                           | Contenu                                                               |
  | -------------------------- | --------------------------------- | --------------------------------------------------------------------- |
  | Points de retrait          | `/b2b/reglages/points-de-retrait` | la carte des points ; réduction avec ses cases **B2B / B2C** (D2)     |
  | Livraison                  | `/b2b/reglages/livraison`         | la **carte « Livraison »** : cases **B2B / B2C** (D4), puis les zones |
  | Heures limites de commande | `/b2b/reglages/heures-limites`    | la section actuelle des heures limites, telle quelle                  |

- **Ce qui déménage** — fait le 2026-09-15 (`04e0d15a`). Le dossier
  reglages/retraits-livraisons/ est parti sous
  `apps/lfd-backoffice-frontend/src/app/b2b/reglages/`, où il vit aujourd'hui
  découpé par page : `pickup-addresses-page/` et `pickup-address-page/` (les
  points), `delivery-availability-page/` avec `delivery-zones-section/` (la
  livraison), `order-cutoffs-page/` avec `cutoffs-section/` (les heures
  limites), leurs services à côté. Ses **trois** importeurs ont suivi (écran
  de commande staff, fiche client,
  `fiche-client/__tests__/nouveau-compte.spec.ts`). L'onglet a quitté
  `/reglages` ; **l'accueil du droit `b2b_settings:read`**
  (`auth/permission.guard.ts`) reste `/reglages`. L'**ancienne adresse
  redirige** vers `/b2b/reglages/points-de-retrait`. ⚠️ Deux phrases de ce
  paragraphe ont vieilli (relu le 2026-10-07) : la redirection par défaut de
  `/reglages` passait à « Surtaxe de retard », elle mène à **Facturation**
  depuis que la surtaxe est partie en Comptabilité, le 2026-09-29
  (`reglages/reglages.routes.ts:13`) — `/reglages` n'a plus que deux onglets,
  Facturation et Commercial ; et `/livraison` ne pointe plus vers
  `/b2b/reglages/livraison` : c'est la **feuille de route** de la livraison,
  sans lien vers ce réglage, qu'on atteint par le rail (« E-commerce LFC →
  Réglages → Livraison »). **Tests** à suivre :
  `__tests__/app.routes.spec.ts` (registre des écrans et table exacte des
  redirections), la spec des onglets de `/reglages` (retirée le 2026-10-10
  avec la page : les Réglages n'ont plus d'écran),
  `b2b/b2b-page/b2b-page.spec.ts`. **Docs** qui citent l'ancien chemin :
  `documentation/order/architecture-heure-limite-de-commande.md`,
  `documentation/order/demontage-order-cutoff.md`,
  `documentation/plan-demo-2026-09-19.md` (vitruve, S7).
- **Dans les pages.** Le point de retrait a sa **page**, et non un panneau
  (`/b2b/reglages/points-de-retrait/:id`, depuis le 2026-09-16, `380871e86`) :
  sous « Réduction de retrait », deux cases **B2B** et **B2C**, grisées tant
  qu'il n'y a pas de réduction ; la carte du point affiche la remise avec sa
  clientèle (« −10 % · B2B »). Carte « Livraison » : les deux cases en tête, et
  en clair sous une case décochée « Les particuliers ne peuvent plus choisir la
  livraison. » ; elles ne s'enregistrent **pas au geste** mais par
  **« Enregistrer »**, avec « Annuler » et un avertissement avant de retirer
  une clientèle (brouillon, `4a97f524a`, 2026-09-15). La même carte porte
  depuis le mode créneau / échéance et les deux marges (D4). Les zones dessous.
- **Écran de commande staff** : l'option « Coursier » est grisée quand la
  livraison est fermée à la clientèle **de la société**, et le serveur la
  refuse (Q1). ⚠️ Pas « toujours B2B », comme ce paragraphe le disait (relu le
  2026-10-07) : l'écran tient la clientèle du statut de la société
  (`audienceOf(company.status)`, `nouvelle-commande-page.ts:265`), comme le
  serveur (D1, Q3). Une société en attente suit donc les règles des
  particuliers, et la raison grisée le dit (`acheminement-commande.ts:134-141`).
  L'écran n'affiche aucune remise — il n'y a rien d'autre à y suivre.
- **Facturation** et **Commercial** restent dans `/reglages`. La **surtaxe de
  retard** y restait aussi ; elle est partie en Comptabilité le 2026-09-29
  (`/comptabilite/surtaxe-de-retard`, sous son propre droit `b2b_late_fee`).

**D7 — La boutique suit l'espace.** Clientèle de l'écran : B2C pour un visiteur,
en perso et dans une société non active, B2B dans une société active (Q3 ; la
même `audienceOf` que le serveur, `client/client-audience.service.ts`).
`pickupDiscountFor(point, audience)` — la règle de
`packages/contracts/src/pickup.ts` que le serveur applique au devis comme à la
commande — et
`bestPickupDiscount(points, audience)` servent la carte de retrait de
l'accueil, le choix de la maison et la barre de commande ; « Mon espace », qui
les lisait aussi, a été supprimé le 2026-09-21. La carte « On vous l'apporte »
n'ouvre la porte du coursier qu'à une clientèle à qui la livraison est
ouverte ; un mode de service « livraison » gardé en local et devenu interdit
s'efface (`order-context.store.ts`). Un point sans remise pour la clientèle
affiche **« Prix pro » en B2B, « Prix boutique » en B2C** (Q2). La passation
attend l'espace connu (`ClientOrders.place`, lot B de l'espace de travail) : un
pro à plusieurs sociétés ne passe jamais en B2C faute d'en-tête.

🔴 **Régression du 2026-09-21 au 2026-10-07 : la porte du coursier ne lisait
plus le réglage.** `c71efb5b5` a supprimé l'ancienne page de commande, dont le
`deliveryOffered` appliquait `deliveryOpenTo(réglage, clientèle)` ; la porte de
l'accueil qui l'a remplacée ne lisait que la clientèle et la clé
`publicDelivery` (D4). Une clientèle fermée par le réglage voyait donc la carte
ouverte, et le clic menait au refus 409 du devis ou de la commande : rien ne
partait, mais le back-office promettait « elle disparaît de leur boutique ».
**Corrigé le 2026-10-07 (B5)** : `OrderDoors.deliveryOpen` combine
`deliveryOpenTo(réglage, clientèle)` — la règle du devis et de la commande —
avec la clé `publicDelivery` hors pros. Fermée, la carte reste à sa place,
grisée et marquée « Bientôt », et le dialogue d'adresse ne s'ouvre plus ; le
back-office dit désormais « leur boutique ne la propose plus ». Tant que le
réglage n'est pas lu, il vaut son défaut ouvert à tous, et le serveur garde le
refus.

**D8 — Ce que ça remplace dans l'analyse.** D2 et D5 de
`analyse-boutique-publique.md` ne sont plus des règles de code : ce sont des
**réglages**. Les défauts reproduisent l'existant ; fermer au public est un geste
de Hugo dans le back-office. ⚠️ **Pour la livraison, c'est l'inverse depuis le
2026-09-21** (relu le 2026-10-07) : la clé `publicDelivery`, fermée par défaut,
tient la livraison fermée aux particuliers et aux visiteurs, et l'**ouvrir**
demande deux gestes — la case « B2C » de « Livraison » et la clé dans « Accès
aux fonctionnalités » (D4).

## 3. Ce que ce plan ne fait pas

- **Pas de tarif public ni de TTC** : la remise reste calculée en HT.
- **Pas de clientèle par zone** ni de livraison par point.
- **Pas de reprise des commandes passées** : une remise figée ne se recalcule pas.
- **Pas de lien avec `PickupAccess`** (`public` / `pro`, les créneaux d'un
  point) : un particulier peut toujours réserver un créneau pro. Deux oppositions
  voisines, pas encore la même ; à rapprocher le jour où le public ouvre.

## 4. L'ordre de déploiement

Une migration **additive** : deux colonnes à défaut `true`, une table neuve. Les
contrats ajoutent des champs ; le `PATCH` d'un point devient « absent =
inchangé », ce qui ne refuse rien de ce qu'envoie le back-office en ligne. L'API
part avec les fronts dans le même merge ; un front servi avant l'API lit une vue
sans les nouveaux champs et doit les **tenir pour ouverts**.

## 5. Les lots

**A — serveur** ✅ : migration ; contrats ; `audienceOf` (selon Q3) ;
`PickupDiscount` et son refus ; `PATCH` sans défaut ; `CartAdjustments` à trois
arguments et ses deux appelants ; le module `delivery-availability` (port, adaptateur,
trois routes, fait journalisé, préfixe du journal) ; e2e : remise B2B seule
absente en perso et appliquée dans la société, au devis ET à la commande ;
livraison fermée au B2C → 409 aux deux ; ligne absente = ouverte ; `PATCH` d'un
point sans `discountAudiences` ne rouvre rien.

**B — back-office** ✅ : le rail et le titre ; les trois pages et leur routage ;
le déménagement et ses importeurs ; redirection, onglet retiré, lien de
`/livraison` (disparu depuis avec la page « À venir », D6) ; cases du point,
badge, carte « Livraison », « Coursier » grisé ; `DELIVERY_SERVICE_OPEN`
remplacé dans la fiche client ; tests et docs du §D6.

**C — boutique** ✅ : `pickupDiscountFor` / `bestPickupDiscount` par clientèle ;
carte et dialogue de retrait, Mon espace (supprimé le 2026-09-21) ; porte de
livraison fermée à la clientèle — régressée le 2026-09-21, rétablie le
2026-10-07 (D7) —, mode de service effacé ; le refus 409 montré au devis ;
préférences d'acheminement de Mon compte sur le réglage ; libellés « Prix
boutique » en trois langues.

## 6. Questions pour Hugo

**Q1 — Le staff peut-il livrer quand la livraison est fermée au B2B ?**
**Non** (Hugo, 2026-09-15) : même règle pour tous.

**Q2 — Un point sans remise en B2C ?** **« Prix boutique »** (Hugo, 2026-09-15).

**Q3 — Une société non active compte-t-elle B2B ?** **Non : société active
seulement** (Hugo, 2026-09-15). Un pro en cours de validation voit les règles B2C
jusqu'à l'activation de son dossier. Une dérogation pour la livraison est
demandée, non bâtie :
[`todo-livraison-accordee-avant-activation.md`](todo-livraison-accordee-avant-activation.md).

**Q4 — Tranchée et bâtie le 2026-10-07 (Hugo : « pas si la livraison publique
est fermée »)** : `POST /orders` refuse la livraison d'un particulier connecté
quand la clé est fermée pour lui (`PublicDeliveryGate`, lue pour la personne,
exemptions comprises), et la boutique efface son choix mémorisé. Question
d'origine : **la clé `publicDelivery` vaut-elle pour un
particulier connecté ?** Au serveur, elle n'est lue que par `POST /shop/orders`,
la commande sans compte (`place-shop-order.handler.ts:94-99`). Un particulier
connecté — en perso, ou dans une société non active — commande par
`POST /orders`, où seule la case « B2C » du réglage peut refuser une livraison
(`customer-audience.e2e-spec.ts:221`) ; le serveur n'y lit pas la clé. La
boutique, elle, lui cache la porte du coursier tant que la clé est fermée (D7).
Avec les défauts — case ouverte, clé fermée —, l'écran ne lui propose donc pas
la livraison, et le serveur ne la lui refuse pas. Laquelle des deux lectures
est voulue : la clé pour toute la clientèle B2C, au serveur aussi, ou pour les
seules commandes sans compte, à l'écran aussi ?

## 7. La contradiction de `vitruve` (2026-09-15) et son sort

| Objection                                                                                                                                           | Sort                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **B1** « B2B = société agissante » : n'importe qui devient B2B en déclarant une société                                                             | tranchée — Q3 : société active seulement (D1)                   |
| **S2** le `PATCH` à défaut `true` rouvre en silence une remise fermée                                                                               | corrigée — D2, absent = inchangé                                |
| **S3** le refus 400 sans mécanisme, trois états non tranchés                                                                                        | corrigée — D2, value object, cases ignorées sans réduction      |
| **S4** `DELIVERY_SERVICE_OPEN`, seconde source de vérité                                                                                            | corrigée — D4, constante retirée, lecteurs en B2B               |
| **S5** le 409 jamais lu au devis ; la seconde phrase sans auteur                                                                                    | corrigée — D5, message unique, refus montré                     |
| **S6** `delivery_availability.` absent du classement du journal                                                                                     | corrigée — D4                                                   |
| **S7** tests, troisième importeur, accueil du droit, titre de route, docs                                                                           | corrigée — D6, lot B                                            |
| Mineures : remise inexistante à l'écran staff, `PickupAccess`, `PUT`/`PATCH`, vue sans ligne, espace non déclaré, `bestPickupDiscount`              | corrigées — D4, D6, D7, §3                                      |
| Non vérifiés : portes du prix (`lint:dated-decisions`, `lint:price-door`, `lint:price-pipeline`), specs `toEqual` sur la vue, vérification du SIRET | à lever au lot A ; le SIRET borne le coût de B1, pas sa réalité |

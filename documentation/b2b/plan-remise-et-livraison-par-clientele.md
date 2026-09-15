# Plan — la remise de retrait et la livraison, par clientèle

> **Statut : 📐 doc-first, 2026-09-15.** Rien n'est codé. Touche **l'argent** (la
> remise appliquée au panier) et porte une **migration** : contredit par
> `vitruve` avant d'être bâti (§7).
>
> Lu avant : [`plan-espace-de-travail.md`](plan-espace-de-travail.md) (l'espace
> perso ou pro, bâti le même jour) et
> [`analyse-boutique-publique.md`](analyse-boutique-publique.md), dont ce plan
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

| Fait                                                                                                                                                                                                                                                        | Où                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| La remise d'un point est `discount_mode` + `discount_value` sur `pickup_addresses` ; les frais d'une zone, `fee_mode` + `fee_value` sur `delivery_zones`. Aucune notion de clientèle                                                                        | `apps/lfd-api/prisma/schema/public/settings.prisma`                                                                                                    |
| **Un seul endroit** applique remise et frais : `CartAdjustments.forPickup` / `forDelivery`                                                                                                                                                                  | `apps/lfd-api/src/b2b/orders/application/services/cart-adjustments.service.ts`                                                                         |
| Ses deux appelants : le devis de la boutique et la composition de la commande. Tous deux connaissent la société agissante (`companyId`, `null` sans société)                                                                                                | `b2b/orders/application/queries/quote-shop-cart.handler.ts`, `b2b/orders/application/services/order-drafting.service.ts`                               |
| Le devis anonyme (`POST /shop/quote`) passe `companyId = null` ; le devis reconnu et `POST /orders` lisent `@ActingCompany()`, `null` en perso                                                                                                              | `b2b/orders/http/`                                                                                                                                     |
| Une commande **saisie par le staff** exige une société et un rattachement de l'acheteur (`ensureOrderMember`)                                                                                                                                               | `b2b/orders/application/commands/place-order-for-customer.handler.ts`                                                                                  |
| Points et zones sont des CRUD honnêtes (port `create`/`update`, pas d'agrégat) ; chaque écriture publie un fait journalisé (`pickup_address.updated`, `delivery_zone.updated`), éprouvé par une spec                                                        | `b2b/pickup-addresses/`, `b2b/delivery-zones/`, `b2b/delivery-zones/application/__tests__/commercial-settings-facts.spec.ts`                           |
| Les listes `GET /pickup-addresses` et `GET /delivery-zones` sont **publiques** et déjà servies à un front en ligne                                                                                                                                          | `b2b/pickup-addresses/http/`, `b2b/delivery-zones/http/`                                                                                               |
| Aucun modèle de réglage commercial global n'existe : `settings.prisma` ne porte que `PickupAddress`, `DeliveryZone`, `PlatformContent` (textes de vitrine). Le précédent d'un réglage audité avec son auteur figé est `FeatureAccessOverride`               | `prisma/schema/public/settings.prisma`, `prisma/schema/public/feature-access.prisma`                                                                   |
| Back-office : une page « Retraits et livraisons » — carte des points, section des zones, section des heures limites ; la réduction se saisit par `lfd-price-alteration-field` dans le panneau du point                                                      | `apps/lfc-B2B-admin-frontend/src/app/reglages/retraits-livraisons/`                                                                                    |
| Boutique : la remise se lit sur la carte « Je passe le prendre », dans le dialogue de retrait, dans le bloc pro de Mon espace ; la livraison s'ouvre par la carte « On vous l'apporte » et son dialogue d'adresse                                           | `apps/lfc-B2B-platform-frontend/src/app/client/shop/pickup-discount.ts`, `client/mon-espace/pro-summary.ts`, `client/nouvelle-commande/commande-page/` |
| Le rail du back-office déclare l'espace `b2b` (titre « B2B ») et ses vues par section (`Catalogue`, `Tarification`, `Contenu`) ; ses pages vivent sous `/b2b`, gardées par `b2b_settings:read`                                                              | `apps/lfc-B2B-admin-frontend/src/app/shared/workspace-rail/workspaces.ts`, `apps/lfc-B2B-admin-frontend/src/app/b2b/b2b.routes.ts`                     |
| « Retraits & livraisons » est un onglet de la page `/reglages` (avec Surtaxe de retard, Facturation, Commercial), et il porte **trois** cartes : points, zones, heures limites. Ses services sont importés par l'écran de commande staff et la fiche client | `apps/lfc-B2B-admin-frontend/src/app/reglages/reglages.routes.ts`, `reglages/reglages-page.ts`, `reglages/retraits-livraisons/`                        |
| Une page `/livraison` (« À venir ») renvoie vers `/reglages/retraits-livraisons`                                                                                                                                                                            | `apps/lfc-B2B-admin-frontend/src/app/livraison/livraison-page/livraison-page.html`                                                                     |
| L'espace courant est connu du front (`ClientWorkspace`) : perso, ou une société                                                                                                                                                                             | `client/client-workspace.service.ts`                                                                                                                   |
| L'analyse de la boutique publique proposait « pas de remise de retrait pour le public » (D2) et « retrait seul pour le public » (D5)                                                                                                                        | `documentation/b2b/analyse-boutique-publique.md` §6                                                                                                    |

## 2. Décisions

**D1 — La clientèle d'une requête.** **B2B** quand une société agit
(`companyId` non nul) ; **B2C** sinon — visiteur anonyme, espace perso, personne
sans société. Une commande saisie par le staff est toujours B2B (§1). La
clientèle se **déduit** de ce que le serveur résout déjà ; elle ne se déclare
jamais, ni dans un corps ni dans un en-tête.

**D2 — La remise d'un point porte ses clientèles.** Deux colonnes
`discount_for_b2b` et `discount_for_b2c`, `BOOLEAN NOT NULL DEFAULT true` sur
`pickup_addresses`. Le défaut à `true` **reproduit l'existant** : aujourd'hui
toute requête reçoit la remise. Contrat : `discountAudiences: { b2b, b2c }` dans
le payload (défaut les deux à `true`, donc un client qui ne l'envoie pas reste
valide) et dans la vue. Une réduction qui ne vise **aucune** clientèle est
refusée (400) : c'est une absence de réduction mal dite, et l'écran doit le dire.

**D3 — Le serveur applique, à un seul endroit.** `forPickup(id, subtotal,
audience)` rend la remise seulement si la clientèle en fait partie ; sinon
`discountCents = 0` et `discountAdjustment = null` — ce qui est **figé** sur la
commande, comme aujourd'hui. Le devis et la commande passent la même clientèle,
dérivée par une même fonction pure (`audienceOf(companyId)`).

**D4 — La livraison ouverte par clientèle : un réglage, pas une zone.** Une
table `delivery_settings`, **une ligne** à clé naturelle (précédent
`PlatformContent`), `open_to_b2b` et `open_to_b2c`, avec l'instant (`Clock`) et
l'auteur figé du geste (précédent `FeatureAccessOverride`). **Ligne absente =
ouverte aux deux** : l'existant, sans semis. Routes : `GET`/`PUT
/admin/delivery-settings` (droit du réglage des points et zones), `GET
/delivery-settings` public. Fait journalisé `delivery_settings.updated`.

**D5 — Une livraison fermée se refuse au serveur.** `forDelivery(codePostal,
subtotal, audience)` lève `DeliveryClosedForAudienceError` (`BusinessError`, 409) quand la clientèle n'y a pas droit — au devis comme à la commande. Le
message nomme le cas réel et la sortie : « La livraison n'est pas proposée pour
cet espace. Choisissez le retrait, ou basculez sur votre société. » (la seconde
phrase seulement en B2C pour qui a une société — sinon elle est omise).

**D6 — Le back-office : trois pages dans « E-commerce LFC → Réglages ».**

- **Le rail.** L'espace `b2b` prend le titre **« E-commerce LFC »** — le libellé
  seul : la clé et les adresses `/b2b/…` restent, une URL n'est pas un libellé
  (précédent : `journee` / « Fournée du jour »). Une section **« Réglages »**
  s'ajoute après « Contenu », avec trois vues sous `b2b_settings:read` :

  | Vue                        | Adresse                           | Contenu                                                               |
  | -------------------------- | --------------------------------- | --------------------------------------------------------------------- |
  | Points de retrait          | `/b2b/reglages/points-de-retrait` | la carte des points ; réduction avec ses cases **B2B / B2C** (D2)     |
  | Livraison                  | `/b2b/reglages/livraison`         | la **carte « Livraison »** : cases **B2B / B2C** (D4), puis les zones |
  | Heures limites de commande | `/b2b/reglages/heures-limites`    | la section actuelle des heures limites, telle quelle                  |

- **Ce qui déménage.** Le dossier `reglages/retraits-livraisons/` part sous
  `b2b/reglages/` et se découpe en trois pages ; les imports de l'écran de
  commande staff et de la fiche client suivent. L'onglet « Retraits &
  livraisons » quitte `/reglages`, dont la redirection par défaut passe à
  « Surtaxe de retard ». L'**ancienne adresse redirige** vers
  `/b2b/reglages/points-de-retrait` (elle vit dans des favoris). La page
  `/livraison` « À venir » pointe vers `/b2b/reglages/livraison`.
- **Dans les pages.** Panneau du point : sous « Réduction de retrait », deux cases
  **B2B** et **B2C**, grisées tant qu'il n'y a pas de réduction ; la carte du point
  affiche la remise avec sa clientèle (« −10 % · B2B »). Carte « Livraison » : les
  deux cases en tête, enregistrées au geste, et en clair sous une case décochée
  « Les particuliers ne peuvent plus choisir la livraison. » ; les zones dessous.
- **Écran de commande staff** (toujours B2B) : l'option « Coursier » suit
  `open_to_b2b`, la remise affichée suit `discount_for_b2b` — **→ Q1**.
- **Surtaxe de retard, Facturation, Commercial** restent dans `/reglages` : la
  demande ne vise que les trois pages de l'acheminement.

**D7 — La boutique suit l'espace.** Clientèle de l'écran : B2C pour un visiteur
et en perso, B2B dans une société. Une fonction unique `discountFor(point,
audience)` sert la carte de retrait, le dialogue et Mon espace. La carte
« On vous l'apporte » ne paraît pas quand la livraison est fermée à la clientèle ;
un mode de service « livraison » gardé en local et devenu interdit s'efface (le
serveur, lui, refuserait). Un point sans remise pour la clientèle affiche
« Prix pro » en B2B — **→ Q2** pour le B2C.

**D8 — Ce que ça remplace dans l'analyse.** D2 et D5 de
`analyse-boutique-publique.md` ne sont plus des règles de code : ce sont des
**réglages**. Les défauts reproduisent l'existant (remise et livraison ouvertes
aux deux) ; fermer au public avant son ouverture est un geste d'Hugo dans le
back-office.

## 3. Ce que ce plan ne fait pas

- **Pas de tarif public ni de TTC** : la remise reste calculée en HT (analyse §3).
- **Pas de clientèle par zone** ni de livraison par point : un seul réglage de
  livraison, global.
- **Pas de reprise des commandes passées** : une remise déjà figée ne se
  recalcule pas.

## 4. L'ordre de déploiement

Une migration **additive** : deux colonnes à défaut `true`, une table neuve. Les
contrats ne font qu'**ajouter** des champs. L'API part avec les fronts dans le
même merge ; un front servi quelques secondes avant l'API lit une vue sans les
nouveaux champs et doit les **tenir pour ouverts** (défaut de l'existant).

## 5. Les lots

**A — serveur** : migration ; contrats (`discountAudiences`, vue et payload des
réglages de livraison) ; `audienceOf` ; `CartAdjustments` à trois arguments et
ses deux appelants ; le refus 400 d'une réduction sans clientèle ; le module
`delivery-settings` (port, adaptateur, deux routes, fait journalisé) ; e2e :
remise B2B seule refusée en perso et appliquée dans la société, au devis ET à la
commande ; livraison fermée au B2C → 409 au devis et à la commande, ouverte en
B2B ; ligne absente = ouverte.

**B — back-office** : le rail (titre, section « Réglages », trois vues) ; les
trois pages sous `/b2b/reglages/` et leur routage ; le déménagement du dossier et
ses imports ; la redirection de l'ancienne adresse et l'onglet retiré de
`/reglages` ; le lien de `/livraison` ; les cases du panneau du point, le badge de
clientèle, la carte « Livraison », l'écran de commande staff.

**C — boutique** : `discountFor`, carte et dialogue de retrait, Mon espace, carte
de livraison masquée, mode de service effacé, libellés trois langues.

## 6. Questions pour Hugo

**Q1 — Le staff peut-il livrer quand la livraison est fermée au B2B ?**
Proposition : **non**, même règle — un réglage que le back-office contourne
n'est plus un réglage, et le client verrait sur sa commande ce qu'il ne peut pas
choisir lui-même.

**Q2 — Que dit la ligne d'un point sans remise en B2C ?** « Prix pro » y serait
faux. Proposition : **« Prix boutique »** — c'est le prix que paie le particulier.

## 7. La contradiction de `vitruve`

_À venir._

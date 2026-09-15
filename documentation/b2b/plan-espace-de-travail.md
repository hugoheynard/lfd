# Plan — l'espace de travail : perso ou pro

> **Statut : 🟡 bâti le 2026-09-15, non déployé.** Lots A (serveur) et B
> (front) bâtis, batterie complète verte, bascule vérifiée par Hugo en dev.
> Reste : le contrôle à l'écran d'un compte à deux sociétés, et le pré-vol CORS
> de `x-lfc-company` en production. **Contredit par
> `vitruve` le 2026-09-15** (§7) : deux `BLOQUANT` traités. **Q1 et Q2
> tranchées par Hugo le même jour** (§6) ; migration en un seul passage, faute
> de panier en production (§4).
>
> Lu avant : [`analyse-boutique-publique.md`](analyse-boutique-publique.md), dont
> ce plan réalise le **lot 1** (le sélecteur d'espace) et une partie de ce qui
> le rend utilisable pour quelqu'un qui n'a qu'une société.

## 0. La demande

Hugo, le 2026-09-15 : maintenant que la boutique sert le public et les pros, une
personne doit pouvoir **basculer d'espace** depuis son menu (le popover de
droite) — « Perso », ou l'un de ses comptes pros s'il en a plusieurs — et voir
**sous le sélecteur l'enseigne pour laquelle elle travaille**. Le choix se
**stocke dans les préférences de navigation** de la personne (`nav_prefs`).
Puis, le même jour : **un panier par espace**, perso compris ; **pas de
sélecteur** pour qui n'a aucune société.

## 1. L'existant (ouvert et vérifié le 2026-09-15)

| Fait                                                                                                                                                                                                                                 | Où                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `resolveCompany` : aucun rattachement → `null` ; **un seul → celui-là, en-tête ignoré** ; plusieurs → l'en-tête décide s'il désigne un rattachement, sinon `null`                                                                    | `apps/lfd-api/src/platform/auth/resolve-company.ts`                                                                                        |
| Conséquence : **« Perso » est inexprimable** pour qui a exactement une société                                                                                                                                                       | idem, branche `rest.length === 0`                                                                                                          |
| L'en-tête est lu à un seul endroit, `declaredCompany`, et confronté aux rattachements                                                                                                                                                | `apps/lfd-api/src/platform/auth/auth.guard.ts`                                                                                             |
| **Seul `@ActingCompany()` lit la société agissante** : la vitrine `/shop/catalogue/mine`, le devis `/shop/quote/mine`, la passation `POST /orders`. Les routes `/companies/:companyId/*` passent par le rôle, pas par elle (vitruve) | `apps/lfd-api/src/platform/auth/acting-company.decorator.ts`, `apps/lfd-api/src/b2b/orders/http/`                                          |
| Société `null` à la passation : tarif catalogue et **carte obligatoire** ; société active à termes accordés, sans règlement demandé : **au compte**                                                                                  | `apps/lfd-api/src/b2b/orders/application/commands/place-order.handler.ts`                                                                  |
| **Aucun front n'envoie `x-lfc-company`** ; le front prend `companies()[0]` pour la société, les adresses et l'historique. Une e2e l'envoie déjà                                                                                      | `client/client-company.service.ts`, `client-addresses.service.ts`, `client-order-history.service.ts`, `test/my-shop-catalogue.e2e-spec.ts` |
| D'où un **désaccord** : à plusieurs sociétés, l'écran montre la première, le serveur chiffre et encaisse pour `null`                                                                                                                 | les lignes précédentes                                                                                                                     |
| La passerelle transmet les en-têtes aux backends ; seul le chemin vers les fronts statiques est filtré                                                                                                                               | `gateway/src/index.ts`, `gateway/src/routes.ts`                                                                                            |
| Le CORS de l'API ne déclare pas `allowedHeaders` : le paquet `cors` renvoie les en-têtes demandés au pré-vol. **Non rejoué**                                                                                                         | `apps/lfd-api/src/main.ts`                                                                                                                 |
| `User.navPrefs` est un sac JSON ; `PATCH /me/nav-prefs` n'accepte que `catalogueView`, et 🔴 **l'écriture remplace le sac entier**                                                                                                   | `b2b/account/http/me.controller.ts`, `b2b/account/infrastructure/prisma-nav-preferences.repository.ts`                                     |
| Le panier est **à la personne** (`ShopCart.userId @unique`), par décision écrite au-dessus du modèle. **Ce plan la renverse** (D9). Son écriture est un `upsert where userId` — `INSERT … ON CONFLICT ("user_id")` en natif          | `prisma/schema/public/orders.prisma`, `b2b/orders/infrastructure/prisma-shop-cart.repository.ts`                                           |
| `migrate deploy` passe **avant** `wrangler deploy` : l'ancienne image sert un moment sur la base migrée                                                                                                                              | `.github/workflows/deploy_lfd_api.yml`                                                                                                     |
| Le navigateur garde le panier sous **une** clé (`cart`) ; la synchronisation relit le serveur **une seule fois**, en même temps que `/me` part ; un débounce de 300 ms écrit ; une lecture vide pousse la copie locale               | `client/cart/cart.store.ts`, `client/cart/shop-cart-sync.service.ts`, `account/account.service.ts`                                         |
| Les commandes passées sont aussi gardées en local (clé `orders`), et la clé de tentative de passation survit jusqu'au succès ; l'empreinte d'idempotence inclut la société                                                           | `client/client-orders.service.ts`, `b2b/orders/domain/services/order-fingerprint.ts`                                                       |
| Un **second sélecteur** existe dans `legacy/commerce`, avec sa clé locale et sa règle `companies[0]`                                                                                                                                 | `legacy/commerce/commerce-context.service.ts`                                                                                              |
| La vitrine ne se recharge que si « reconnu ou non » change ; le mode de service vit en `localStorage`                                                                                                                                | `client/shop/shop-catalogue.store.ts`, `client/order-context.store.ts`                                                                     |
| Unicité avec `NULL` : précédent `NULLS NOT DISTINCT` en SQL brut, Postgres 17 ; Prisma ne l'exprime pas et un `migrate dev` propose de le supprimer                                                                                  | `prisma/migrations/20260826090000_unicite_slug_rang_emplacement/migration.sql`                                                             |
| `fold-dropdown-item` (fold-ng 0.27.2) : `disabled`, `tone`, `icon`, sortie `selected` — pas d'état coché                                                                                                                             | `pnpm-workspace.yaml`                                                                                                                      |

## 2. Décisions

**D1 — « Perso » se déclare.** L'en-tête accepte une valeur réservée,
`x-lfc-company: personal`, qui résout `null` **quel que soit** le nombre de
rattachements. Une valeur qui n'est ni `personal` ni un rattachement reste
ignorée. Un `cuid()` ne peut pas valoir `personal`.

⚠️ **Ce n'est PAS un cran qui ne fait que retirer** — la première version le
disait, et c'était faux (vitruve, S2). En accès, `null` ne franchit aucun mur.
En **prix**, il en ouvre : quelqu'un rattaché à une société peut désormais
commander hors de sa mercuriale — donc avec les promotions qu'elle scelle, hors
d'un `replace` qui serait au-dessus du catalogue, hors du cumul d'un engagement
de volume — et commander en perso pour une société suspendue. **→ Q1.**

**D2 — L'absence d'en-tête ne change pas de sens.** Les fronts déjà servis
n'envoient rien et gardent les trois branches actuelles.

**D3 — La préférence : `workspace: string | null`** dans le sac — `personal`,
un identifiant de société, ou `null`. `PATCH /me/nav-prefs` devient un **patch**
(`catalogueView?`, `workspace?`, au moins un) ; `workspace: null` efface le
choix. Le handler refuse une société hors rattachements (`BusinessError`, 409).
Le front en production, qui n'envoie que `{ catalogueView }`, reste valide.

**D4 — L'écriture fusionne en une instruction** :
`UPDATE users SET nav_prefs = COALESCE(nav_prefs, '{}') || $patch` — aucune
écriture concurrente sur une autre clé ne peut plus en effacer une.

**D5 — L'espace par défaut, côté front.** La préférence si elle désigne encore
`personal` ou un rattachement ; sinon la **seule** société ; à plusieurs
sociétés, **`personal`** (Q2) ; sans société, `personal` (et pas de sélecteur,
D8).

**D6 — L'en-tête, et quand il part.**

- `ClientWorkspace.current` vaut `null` **tant que `/me` n'a pas répondu** ;
  les lecteurs par espace (panier, vitrine, devis, historique, adresses)
  **attendent** qu'il soit connu au lieu de partir sans en-tête (vitruve, B2).
- Un `HttpInterceptorFn` pose l'en-tête sur les requêtes vers
  `AUTH_CONFIG.apiBaseUrl`, et seulement celles-là.
- **Exception : l'écriture du panier** reçoit l'espace **en argument**, capturé
  au geste, et le pose elle-même. Lu à l'envoi, un débounce parti après une
  bascule écrirait les lignes de l'ancien espace dans le nouveau.

**D7 — Ce qui suit un changement d'espace.**

| Surface                        | Effet                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `ClientCompany.company`        | la société de l'espace, `null` en perso                                                                                 |
| Adresses, historique           | relus pour l'espace                                                                                                     |
| Vitrine, devis                 | relus : la photo est prise **pour un espace**                                                                           |
| Panier                         | celui de l'espace (D9)                                                                                                  |
| Mode de service choisi         | **effacé** : une adresse appartient à une société, et la remise de retrait d'un point peut changer                      |
| Commandes gardées en local     | **rangées par espace** (clé `orders.<espace>`)                                                                          |
| Clé de tentative de passation  | **par espace** : sinon un renvoi après bascule lève `IdempotencyKeyReusedError`                                         |
| Sélecteur de `legacy/commerce` | vérifier s'il est encore monté ; s'il l'est, il lit `ClientWorkspace` au lieu de sa clé — deux sélecteurs divergeraient |

**D9 — Un panier par espace, perso compris** (Hugo, 2026-09-15). `company_id`
vide = le perso, comme les commandes.

- `shop_carts.company_id` **nullable**, clé étrangère vers `companies` ; unicité
  `(user_id, company_id) NULLS NOT DISTINCT` en SQL brut, avec l'avertissement
  du précédent recopié au-dessus du modèle.
- **L'écriture est un `INSERT … ON CONFLICT (user_id, company_id) DO UPDATE`
  en SQL brut** : Prisma n'accepte pas `null` dans un filtre d'unicité composée,
  et un `findFirst` puis `create` lèverait `P2002` sur deux écritures simultanées
  (la reprise et le débounce).
- `GET` et `PUT /shop/cart` prennent l'espace de `@ActingCompany()`.
- **Aucun panier existant** en production (Hugo, 2026-09-15) : pas de backfill.
- L'ancienne unicité `user_id` tombe dans la même migration : §4 dit ce que ça
  coûte pendant la bascule.
- **Côté navigateur** (vitruve, B2) : la synchronisation est **réécrite** — une
  reprise **par espace** et non une fois par session ; clé locale par espace ; à
  la bascule, le débounce en attente est **abandonné**, le magasin local est
  **échangé avant** la relecture, et une relecture vide ne pousse **rien** (seul
  le panier d'un visiteur non reconnu remonte, une fois, dans l'espace par
  défaut).
- ⚠️ **Entre le lot A et le lot B**, sans en-tête, le panier suit
  `resolveCompany` : ouvrir sa société (0 → 1) ou en rejoindre une seconde
  (1 → 2) change l'espace servi, et le panier d'avant semble perdu jusqu'au lot B
  (vitruve, S3). La fenêtre se tient courte ; elle n'efface rien en base.

**D8 — Le menu.** **Le sélecteur n'existe que si la personne a au moins une
société** (Hugo, 2026-09-15) : sans rattachement, le menu reste tel
qu'aujourd'hui. Sinon : « Perso », puis une entrée par société (enseigne, raison
sociale à défaut), l'espace courant marqué de l'icône `check` ; dessous, une
ligne non cliquable — l'enseigne en cours, ou « Compte perso » ; puis « Mon
profil » et « Se déconnecter ». Le menu de poche (`nav/client-menu`) reçoit le
même sélecteur.

## 3. Ce que ce plan ne fait pas

- **Pas de tarif public.** En perso : tarif catalogue et carte.
- **Pas de refus de la commande ambiguë** ni de colonne de clientèle (lot 2 de
  l'analyse).
- **Pas de réponse à D1 de l'analyse** : un rattachement `pending` donne
  toujours le contexte pro.
- **La faille des consignes de livraison** (vitruve, S6) n'en fait pas partie :
  préexistante, sans rapport avec l'espace, elle est **corrigée à part le
  2026-09-15**, avant ce plan — le lecteur des consignes porte désormais la
  société dans sa requête.

## 4. L'ordre de déploiement

**Hugo, le 2026-09-15 : « on peut migrer comme des brutes, pas de paniers en
prod ».** Aucune ligne dans `shop_carts` : ni backfill, ni déploiement de
resserrage.

1. **Lot A — serveur** : `personal`, préférence `workspace`, fusion du sac ;
   colonne `company_id`, l'unicité `user_id` remplacée par l'unicité composée,
   **dans la même migration**. Pendant la bascule, l'ancienne image écrit par
   `ON CONFLICT (user_id)` sur un index retiré : ses `PUT /shop/cart` échouent
   quelques secondes, en silence côté front, et **sans panier à perdre** — c'est
   le prix assumé de B1. `lecteur-de-migrations` avant le push.
2. **Lot B — front**, dans le même merge ou juste après. Un front servi avant le
   serveur enverrait `personal` à un serveur qui l'ignore : quelques secondes
   d'écran faux, sans commande possible à un autre prix que celui du serveur.

## 5. Les lots

**A — serveur**

1. `resolveCompany` : la branche `personal` ; `PERSONAL_WORKSPACE` à côté de
   `COMPANY_HEADER`. Spec aux trois nombres de rattachements.
2. Contrats : `NavPreferences.workspace`, le schéma du patch.
3. `parseNavPreferences` relit `workspace`.
4. Le port d'écriture devient `merge(userId, patch)`, en une instruction (D4).
   Non-régression : poser une vue de catalogue ne perd pas l'espace.
5. Le handler refuse une société hors rattachements.
6. Migration D9 (colonne, unicité remplacée) ; dépôt du panier par espace (D9) ; routes par
   `@ActingCompany()`. E2e : deux espaces, deux paniers ; le perso unique ; deux
   `PUT` simultanés ne lèvent rien.
7. E2e : `personal` sur `/shop/catalogue/mine` rend le tarif catalogue à
   quelqu'un qui a **une** société négociée ; `PATCH /me/nav-prefs` vers une
   autre maison → 409.

**B — front** (`pablo`)

1. `ClientWorkspace` (D5, D6) : `null` avant `/me`, le choix écrit de façon
   optimiste avec retour arrière à l'échec.
2. L'intercepteur (D6). Spec : posé vers l'API, absent ailleurs, jamais avant
   l'espace connu.
3. **La synchronisation du panier réécrite** (D9) — le morceau le plus risqué du
   lot, ses specs d'abord : bascule pendant un débounce, relecture vide après
   bascule, visiteur qui se reconnaît.
4. `ClientCompany`, `ClientAddresses`, `ClientOrderHistory`,
   `ShopCatalogueStore`, `ClientOrders` (clés locales) lisent l'espace ;
   `OrderContextStore` s'efface ; `legacy/commerce` tranché (D7).
5. Le menu (D8), libellés en trois langues, specs.
6. **Vérification à l'écran**, compte à deux sociétés, et pré-vol CORS en
   production après déploiement.

## 6. Les réponses de Hugo (2026-09-15)

**Q1 — Le perso est ouvert à tout rattaché, sans condition : oui.** Il ouvre le
tarif catalogue et ses promotions hors mercuriale, hors engagement de volume, et
reste ouvert quand la société est suspendue. ⚠️ **Non vérifié** : qu'aucune
mercuriale `replace` ne fixe un prix au-dessus du catalogue — sinon le perso est
la voie la moins chère.

**Q2 — L'espace par défaut, sans préférence : la société si elle est la seule,
le perso s'il y en a plusieurs.** C'est ce que le serveur sert et encaisse déjà
aujourd'hui : aucun changement de règlement ni de prix ; la personne choisit sa
société dans le menu.

## 7. La contradiction de `vitruve` (2026-09-15) et son sort

| Objection                                                                                                  | Sort                                                                  |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **B1** la migration retire l'unicité visée par `ON CONFLICT (user_id)` de l'image encore en ligne          | assumée — aucun panier en production (Hugo) ; §4 dit la fenêtre       |
| **B2** la course reprise / `/me`, la relecture vide qui pousse, le débounce après bascule                  | corrigée — D6 (attente, espace capturé au geste), D9 (sync réécrite)  |
| **S1** « la première société » change règlement et prix                                                    | tranchée — Q2 : perso à plusieurs sociétés, aucun changement d'argent |
| **S2** « un cran qui retire » est faux en prix                                                             | corrigée dans D1, tranchée — Q1 : oui                                 |
| **S3** entre A et B, le panier suit le nombre de rattachements                                             | sans objet avant le lot B — A et B partent ensemble (§4)              |
| **S4** pas d'`upsert` atomique pour le perso                                                               | corrigée — `ON CONFLICT` en SQL brut, avertissement du précédent      |
| **S5** commandes locales, clé de tentative, sélecteur `legacy`                                             | corrigée — D7                                                         |
| **S6** consignes de livraison lues sans le mur                                                             | **vérifiée et corrigée à part**, avant ce plan (§3)                   |
| Mineures : fold-ng 0.27.2, e2e qui envoie l'en-tête, type de `workspace`, transaction inutile, « retrait » | corrigées                                                             |
| Non vérifiés : CORS rejoué, comptes en production, SQL généré par Prisma, SSR                              | CORS et SSR au lot B ; comptes au lot 0 ; SQL relu au lot A1          |

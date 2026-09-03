# L'heure limite de commande, la grâce, et la surtaxe de retard

> Écrit le 2026-09-04. Décrit **ce qui existe** (§1) et **ce qui est proposé**
> (§3 et suivantes). Rien de la proposition n'est codé.

## 1. Ce qui existe déjà — et qui n'est branché à rien

L'heure limite n'est pas à inventer. Elle est **modélisée, contractualisée,
testée et administrable** depuis le back-office :

| Pièce                                                       | État                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| `model OrderCutoff` (`schema.prisma:1068`, schéma `public`) | table `order_cutoffs`                                       |
| `packages/contracts/src/order-cutoff.ts`                    | payload Zod, vue, et **deux fonctions pures** de résolution |
| `packages/contracts/src/__tests__/order-cutoff.spec.ts`     | 12 tests                                                    |
| `GET/POST/PATCH/DELETE /admin/order-cutoffs`                | muré `@AdminSurface("b2b_settings")`                        |
| `reglages/retraits-livraisons/cutoffs-section/`             | l'écran de saisie                                           |

Une règle dit : « pour tel **point de retrait**, tel **jour d'acheminement**, il
faut avoir commandé `daysBefore` jours avant à telle **heure locale** ».
`resolveOrderCutoff` arbitre en quatre rangs — point+jour, point, défaut+jour,
défaut — et `orderCutoffInstant` en tire l'instant butoir.

### 🔴 Personne ne l'applique

`resolveOrderCutoff` et `orderCutoffInstant` **ne sont appelés nulle part** hors
de leur propre spec. Vérifié sur `apps/lfd-api/src`, `apps/lfd-api/test`,
`packages/*/src` et les deux fronts, hors client Prisma généré.

`PlaceOrderHandler` ne vérifie qu'une chose avant de passer commande :
l'appartenance à l'entreprise. Aucune garde temporelle, ni dans le handler, ni
dans `OrderDrafting`, ni sur le devis.

**Ce que ça change pour cette demande.** Le travail n'est pas « ajouter une heure
limite » : c'est **la brancher**, et profiter du branchement pour lui donner
l'axe qui lui manque. Un écran de réglages qui ne refuse rien est pire qu'une
absence de règle — quelqu'un le remplit et croit la limite tenue.

## 2. L'échelle demandée est déjà écrite ailleurs

`global → famille → produit` existe mot pour mot dans le dépôt, du côté des prix
(`packages/contracts/src/pricing.ts:83`) :

```ts
export const PRICE_SCOPE_LABELS: Readonly<Record<PriceScopeType, string>> = {
  global: "Tout le catalogue",
  category: "Famille",
  product: "Produit",
  variant: "Déclinaison",
};
```

**On réutilise `priceScopeSchema`, on n'invente pas un second vocabulaire de
portée.** Deux échelles nommées différemment pour la même idée finiraient par
diverger, et le back-office montrerait « Famille » d'un côté et « Catégorie » de
l'autre pour la même chose.

Elle apporte un quatrième rang que la demande ne nommait pas et qui est le plus
utile : **la déclinaison**. C'est elle qu'on commande — une `OrderLine` porte un
SKU, et un SKU est une déclinaison. Un produit dont le pot de 200 g se prépare la
veille et le seau de 5 kg trois jours avant n'a pas d'heure limite « du produit ».

## 3. La frontière, en une phrase

> **Le référentiel déclare des propriétés d'ARTICLES.
> La plateforme déclare des propriétés d'EXPLOITATION.
> La commande fige ce qui a été convenu.**

| Ce qu'on règle                                                | Où                                        |
| ------------------------------------------------------------- | ----------------------------------------- |
| Le **préavis** d'une famille, d'un produit, d'une déclinaison | **PIM** — ça suit la fiche                |
| Le **défaut**, les exceptions par comptoir et par jour        | **B2B**, Réglages → Retraits & livraisons |
| La **durée de grâce**, le **montant de la surtaxe**           | idem                                      |
| La **dérogation accordée**, la **surtaxe appliquée**          | **figées sur la commande**                |

### Pourquoi le défaut reste au B2B

Il a d'abord été proposé de le remonter au référentiel, avec les autres rangs.
C'était une erreur, et elle se voyait à son coût : il fallait une colonne
`source`, un refus d'écriture au repository, une ligne en lecture seule à
l'écran et une bascule en trois déploiements — **tout cet appareillage n'existait
que pour empêcher une boucle que la coupure elle-même créait** (le staff corrige
la ligne, le push suivant la réécrit, personne ne voit passer l'annulation).

Quand une conception a besoin d'un garde-fou contre un problème qu'elle
introduit, c'est la conception qu'il faut changer. Les trois raisons de fond :

1. **C'est une échelle, pas quatre réglages.** Le rang 4 de `resolveOrderCutoff`
   est le plancher des trois autres. Le mettre dans une autre application met une
   seule échelle dans deux écrans.
2. **C'est la même personne qui règle les quatre rangs.** « On ferme la veille à
   18 h, sauf à Courchevel où c'est 16 h » est une seule phrase. La couper en
   deux applications force un aller-retour pour l'écrire.
3. **Le défaut parle d'exploitation, pas de catalogue.** Il dit quand la journée
   du labo ferme — pas ce que l'article demande.

Et une contrainte qui, de toute façon, l'interdisait en partie : l'axe est
dimensionné par `pickupAddressId`, une ligne de `PickupAddress` (schéma `public`,
`schema.prisma:1024`). Le référentiel a bien une notion de lieu — `PointOfSale`,
schéma `pim`, `:3124` — mais **ce n'est pas la même table et rien ne les relie**
(grep `PointOfSale` dans `src/b2b` : vide). Descendre l'axe demanderait une clé
étrangère `pim → public`, que le document racine interdit.

### La page devient cohérente

`reglages/retraits-livraisons/` porte déjà trois sections : **points de
retrait**, **heures limites**, **zones de livraison**. La grâce et la surtaxe y
entrent sans forcer, parce que les cinq répondent à la même question : _à quelles
conditions on achemine_. Le PIM, lui, garde exactement une chose — **combien de
préavis un article demande**.

## 4. Trois états, pas deux

La limite n'est pas un instant, c'en sont **deux** : la limite, et la fin de
grâce. Ce qui donne trois états, et non un binaire passe/refuse.

| Quand                              | Ce qui se passe                       | Qui intervient          |
| ---------------------------------- | ------------------------------------- | ----------------------- |
| avant la limite                    | passe, prix normal                    | personne                |
| entre la limite et la fin de grâce | passe **si** autorisé, **et** surtaxé | un humain, au téléphone |
| après la grâce                     | refus                                 | personne ne peut ouvrir |

🔴 **Après la grâce, aucune dérogation n'ouvre.** Sinon la grâce n'est qu'un
affichage, et la vraie limite devient « quand le commercial a envie ». C'est une
borne dure, pas un défaut surchargeable.

La grâce est **une durée** (minutes), pas une seconde heure : `limite + grâce`
suit automatiquement chaque rang de l'échelle, alors qu'une heure absolue aurait
dû être ressaisie sur chacun — et se serait retrouvée, un jour, avant sa propre
limite.

## 5. La résolution

Deux axes, et ils ne sont **pas** deux rangs d'une même échelle :

|            | Axe **OÙ / QUAND**                        | Axe **QUOI**                                |
| ---------- | ----------------------------------------- | ------------------------------------------- |
| Dimensions | point de retrait × jour d'acheminement    | famille → produit → déclinaison             |
| Répond à   | « quand ferme la journée de ce comptoir » | « combien de préavis demande cet article »  |
| Nature     | contrainte **opérationnelle**             | contrainte **physique** (production, appro) |
| Réglé dans | le B2B                                    | le PIM                                      |

Les fusionner en un seul « le plus spécifique gagne » produit des égalités
indécidables : une règle _produit, tous les jours_ contre une règle _comptoir, le
dimanche_ — laquelle est la plus spécifique ? Il n'y a pas de réponse, et celle
qu'on coderait par défaut serait l'ordre de lecture.

**Donc : deux résolutions séparées, puis une composition.**

```mermaid
flowchart TD
    L["Ligne de commande<br/>(SKU, date d'acheminement)"] --> Q
    L --> O

    subgraph QUOI["Axe QUOI — le référentiel"]
        Q["Déclinaison ?"] -->|non| P["Produit ?"]
        P -->|non| C["Famille, en remontant l'arbre ?"]
        C -->|non| RIEN["ne se prononce pas"]
    end

    subgraph OU["Axe OÙ/QUAND — la plateforme"]
        O["Comptoir + jour ?"] -->|non| O2["Comptoir ?"]
        O2 -->|non| O3["Défaut + jour ?"]
        O3 -->|non| O4["Défaut plateforme"]
    end

    QUOI --> MIN{"Le plus TÔT<br/>des deux instants"}
    OU --> MIN
    MIN --> CMP{"Maintenant<br/>avant la limite ?"}
    CMP -->|oui| OK["Passe, prix normal"]
    CMP -->|non| G{"Avant la fin<br/>de grâce ?"}
    G -->|non| KO["Refus, ligne par ligne"]
    G -->|oui| W{"Une dérogation<br/>couvre cette date ?"}
    W -->|non| KO
    W -->|oui| TAX["Passe + surtaxe de panier"]
```

Le **plus tôt des deux** gagne, parce que les deux sont des murs et qu'aucun ne
peut percer l'autre : une bouteille de `resale` a beau se commander tard, elle ne
peut pas se commander après la fermeture du comptoir qui la remet ; et un article
qui demande 48 h de préavis ne les perd pas parce que le comptoir du jeudi ferme
tard.

### L'axe QUOI, en détail

**Sémantique de remplacement, pas de cumul.** Le rang le plus précis qui se
prononce remplace les autres.

```
déclinaison ?? produit ?? famille la plus proche en remontant l'arbre ?? (rien)
```

1. **`null` = « ne se prononce pas »**, distinct de « aucune limite ». Sans la
   distinction, on ne peut pas déclarer une famille libre sous un défaut
   contraignant.
2. **La remontée d'arbre est obligatoire.** `Category` porte `parentId`
   (auto-relation `CategoryTree`) : on prend **le plus proche ancêtre qui se
   prononce**, pas la racine.
3. **Le remplacement doit pouvoir RELÂCHER.** `ProductKind` distingue déjà
   `daily`, `made_to_order` et `resale` : une canette se commande légitimement
   plus tard qu'une viennoiserie. Une règle « le plus contraignant gagne » sur
   cet axe interdirait exactement ce pour quoi on la pose — le garde-fou est le
   `min` avec l'autre axe, pas ici.

**Si rien n'est saisi côté PIM**, `résoudre_QUOI` rend `null`, le `min` retombe
sur le seul axe OÙ/QUAND, et le comportement est **exactement** celui
d'aujourd'hui. C'est ce qui rend toute la bascule additive.

## 6. Ce qui traverse le fil

Seul l'axe QUOI voyage : le reste est déjà du bon côté.

Le fil PIM → boutique passe par `packages/catalog-sync/src/snapshot.ts`
(`CATALOG_SNAPSHOT_VERSION = 5`). On y ajoute, en **optionnel**, le préavis
résolu pour chaque déclinaison :

```ts
// syncVariantSchema
orderLeadTime: z
  .object({ daysBefore: z.number().int().min(0).max(14), time: clockTimeSchema })
  .nullable(),
```

Deux exigences non négociables :

- **Le PIM envoie la valeur RÉSOLUE**, pas les trois rangs. La plateforme n'a pas
  à connaître l'arbre des familles pour savoir quand un SKU ferme — même
  raisonnement que `vatRatePercent` sur `CatalogItem` (`schema.prisma:2036` :
  « c'est l'article qu'on vend, c'est lui qui doit savoir se facturer »).
- **Le champ est nullable et le schéma monte de version.** Un contrat déjà servi
  ne se casse pas : `version: 6`, champ optionnel, et les lignes de `CatalogItem`
  d'avant le premier push complet portent `NULL` — « on ne sait pas », donc
  « l'axe QUOI ne se prononce pas ».

## 7. La dérogation

> **Lecture retenue** : « par appel » = un membre de l'équipe prend la commande
> **au téléphone** et accorde l'exception. Le dépôt la porte déjà — `Order`
> distingue `placedByUserId` (au nom de qui) et `placedByStaffId` (qui l'a
> saisie), et `orderOriginOf` en dérive l'origine `back_office`.

Une dérogation n'est **pas** une règle. Elle ne modifie rien dans le référentiel
ni dans les réglages : c'est une **autorisation de passer**, nommée, datée,
bornée et tracée.

```
DÉROGATION = { entreprise, date d'acheminement, motif, auteur, expiration }
```

Six propriétés, chacune parce que son absence a un coût :

1. **Elle vise UNE date d'acheminement.** Pas « ce client est dispensé » — une
   dispense permanente est un réglage, et elle doit se voir comme tel.
2. **Elle ne s'applique qu'à une entreprise.** C'est le mur : une exception
   accordée par téléphone ne peut pas ouvrir la porte aux autres.
3. **Elle ne peut ouvrir que DANS la grâce** (§4). Elle ne porte donc **pas**
   d'heure à elle : la borne est celle de la grâce, et une heure propre lui
   permettrait de la dépasser — ce que §4 interdit.
4. **Elle porte un motif obligatoire.** Une exception sans raison écrite devient
   la règle en trois mois.
5. **Elle nomme son auteur** (`StaffUser.id`, pas une clé étrangère — même
   raisonnement que `placedByStaffId` : une pièce ne disparaît pas parce qu'on
   retire quelqu'un de l'annuaire).
6. **Elle expire.** Au plus tard à la fin de grâce qu'elle vise.

Elle est **consommée**, pas supprimée : `usedByOrderId` renseigné au passage.
« Pas de DELETE physique » vaut ici, et une dérogation accordée puis non utilisée
est une information de gestion.

⚠️ **Elle vivait avec une heure à elle dans la première version de ce document.**
C'était avant que la grâce existe : l'heure de la dérogation jouait le rôle de
borne. Maintenant que la borne est un réglage, une seconde heure sur l'acte ne
ferait que permettre de la contourner.

**Où elle vit** : côté B2B (schéma `public`). Elle parle d'une commande et d'un
client, pas d'un article.

**Qui peut l'accorder** : une ressource dédiée dans `ROLE_GRANTS`. Ni
`b2b_settings` (qui donne le droit d'éditer _la règle_, ce qui n'est pas le même
geste), ni un simple droit de saisie de commande.

## 8. La surtaxe n'est pas un prix

C'est la frontière la plus facile à rater. Le schéma porte la formule du total :

```
total = max(0, subtotal − discount) + deliveryFee + vat
```

Deux modificateurs de panier existent déjà, **hors du moteur de prix** :
`discountCents` (remise de retrait, portée par `PickupAddress`) et
`deliveryFeeCents` (frais de zone, porté par `DeliveryZone`), tous deux en
`CartAdjustmentMode` — `percent | amount`. **La surtaxe de retard est un
troisième terme de la même forme.**

Pourquoi elle ne descend pas dans `PRICE_STAGES` (`mercuriale`, `volume`,
`promotion`, `geste`) :

- ces quatre-là répondent à _« ce que **cet article** vaut pour **ce client** »_.
  La surtaxe répond à _« comment **cette commande** a été passée »_. Sujet
  différent ;
- elle se battrait avec les **planchers**, qui protègent une marge sur l'article.
  Une surtaxe n'est pas de la marge sur le croissant ;
- la boutique ne pourrait pas l'afficher : le même article montrerait deux prix
  pour une raison qui ne le concerne pas ;
- elle est **par commande, pas par ligne**. Un panier où 3 lignes sur 20 sont
  hors limite ne produit pas 3 surtaxes — ce qu'on facture est la reprise d'une
  production close, un coût fixe.

Comme `discountAdjustment`, l'ajustement qui l'a produite est **figé sur la
commande** : changer le tarif demain ne doit pas réécrire ce qu'une commande
partie disait.

### ⚠️ Le taux de TVA de la surtaxe n'est pas tranché ici

Le moteur sait déjà porter un terme non-marchandise à son propre taux —
`DELIVERY_VAT_RATE = 20`, avec sa raison écrite : le transport est une
prestation, son taux ne se paramètre pas.

Une majoration pour commande tardive est **probablement accessoire à la livraison
des marchandises**, donc suivant leurs taux au prorata (5,5 / 20) plutôt qu'un
20 % forfaitaire. **Probablement** : c'est une question comptable, et c'est la
seule du dossier qui coûte de l'argent si on se trompe — sur toutes les commandes
tardives, rétroactivement. À trancher avant le lot correspondant, par quelqu'un
dont c'est le métier.

## 9. Ce que la boutique en montre

Puisque c'est un élément de la boutique B2B, il ne suffit pas de refuser :

- **Sur la fiche et la vignette** : « Commandez avant 18 h pour jeudi ». C'est un
  argument de vente autant qu'une contrainte.
- **Au panier, ligne par ligne.** La résolution étant par SKU, le panier ferme
  quand **sa ligne la plus urgente** ferme. On n'annonce donc pas « trop tard »
  en bloc : on nomme les articles concernés et on laisse commander les autres.
  Un refus global sur un panier de vingt lignes fait perdre les dix-neuf qui
  passaient.
- **Au moment du choix de date** : une date dont l'heure limite est passée se
  grise à la sélection, pas à la validation.
- **La grâce ne s'annonce pas en libre-service.** Un bandeau « encore 40 min pour
  commander en retard, +8 % » ferait de l'exception un mode de commande normal.
  Elle se dit au téléphone, par quelqu'un qui décide.

⚠️ Aujourd'hui la boutique lit `client/mock-shop.ts` et ne parle à aucune route
catalogue. Tant que le **lot 1** de
[`plan-boutique-sur-api.md`](plan-boutique-sur-api.md) n'est pas fait, il n'y a
rien pour porter cet affichage — l'application côté serveur, elle, ne l'attend
pas.

## 10. 🔴 Le piège du fuseau, à régler AVANT de brancher quoi que ce soit

`orderCutoffInstant` construit son instant avec le constructeur `Date` local :

```ts
return new Date(year, month - 1, day - rule.daysBefore, hours, minutes, 0, 0);
```

« Heure locale » signifie **heure locale du process**. Or :

- le `Dockerfile` de `lfd-api` ne pose **aucun `TZ`** (il n'y déclare que
  `NODE_ENV`, `PORT` et `APP_REVISION`) ;
- `wrangler.jsonc` n'a **pas de bloc `vars`** ;
- l'image tourne donc en **UTC**, et `wrangler.jsonc:143` le dit déjà pour les
  crons : « ⚠️ Les crons Cloudflare sont en **UTC** ».

Une limite saisie à `18:00` devient **20 h à Paris en été, 19 h en hiver**. Le
décalage est dormant tant que rien n'applique la règle. Il devient une heure de
commandes acceptées à tort le jour du branchement — et il **change avec la
saison**, ce qui est la pire façon de découvrir un bug.

Trois choses, dans cet ordre :

1. **Poser `ENV TZ=Europe/Paris`** dans le `Dockerfile`, et l'écrire.
2. **Ne pas s'en contenter** : une variable d'environnement se perd en migrant
   d'image. La conversion se fait par `Intl.DateTimeFormat` avec
   `timeZone: "Europe/Paris"`, pas par le constructeur local.
3. **Un test qui échoue avant le correctif**, exécuté sous `TZ=UTC` — sinon il
   passe sur le poste d'Hugo et nulle part ailleurs.

⚠️ `lint:clock-port` ne couvre pas ce code : sa racine de scan est
`apps/lfd-api/src` (`dev-toolbox/gates/clock-port.mjs:36`), et `orderCutoffInstant`
vit dans `packages/contracts`. La porte n'a rien laissé passer — elle ne regarde
pas là.

## 11. Le modèle de données

**Additif, aucune colonne resserrée, aucune valeur de production déplacée.**

### PIM (schéma `pim`) — l'axe QUOI, et lui seul

Une table, pas des colonnes sur `Product` et `Category` : le rang `variant` en
demanderait une troisième, et un champ nul sur trois tables ne dit pas d'où vient
la valeur.

```prisma
model OrderLeadTime {
  id String @id

  /// `category` | `product` | `variant` — mêmes valeurs que `PriceScopeType`.
  /// Pas de `global` : le défaut est un fait d'exploitation (§3).
  scopeType String @map("scope_type")
  scopeId   String @map("scope_id")

  daysBefore Int    @map("days_before")
  /// `HH:MM` en heure d'Europe/Paris.
  time       String

  @@unique([scopeType, scopeId])
  @@map("order_lead_time")
  @@schema("pim")
}
```

### B2B (schéma `public`)

- `OrderCutoff` gagne `graceMinutes Int @default(0)` — la durée de §4, par rang,
  donc surchargeable comme l'heure elle-même.
- Les réglages de plateforme gagnent le **montant de la surtaxe** :
  `lateFeeMode CartAdjustmentMode?` + `lateFeeValue Int?`, la même paire que
  `DeliveryZone` et `PickupAddress`.
- `CatalogItem` gagne `orderLeadDaysBefore Int?` et `orderLeadTime String?` — la
  valeur **résolue** reçue du fil, `NULL` = ne se prononce pas.
- `Order` gagne `lateFeeCents Int @default(0)` et `lateFeeAdjustment Json?`,
  calqués sur `discountCents` / `discountAdjustment`.
- Une table `order_cutoff_waiver` pour les dérogations de §7.
- Les quatre rangs de `resolveOrderCutoff`, sa contrainte d'unicité et ses
  12 tests **ne bougent pas**.

### Le cas nul

`Order.requestedDeliveryDate` est **nullable** (`@db.Date`). Une commande sans
date demandée n'a aucun instant butoir à comparer : elle passe. C'est le
comportement à écrire explicitement, pas à laisser tomber d'un `if`.

## 12. Les lots

| #   | Lot                                                                                          | Dépend de                               |
| --- | -------------------------------------------------------------------------------------------- | --------------------------------------- |
| 0   | **Le fuseau** (§10) : `TZ`, conversion explicite, test sous `TZ=UTC`                         | —                                       |
| 1   | **Brancher l'existant** : garde dans `OrderDrafting`, erreur métier nommée, e2e sur le refus | 0                                       |
| 2   | **La grâce** : `graceMinutes` par rang, les trois états, section de réglages                 | 1                                       |
| 3   | **La dérogation** : table, ressource d'accès, geste depuis la saisie back-office             | 2                                       |
| 4   | **La surtaxe** : réglage, terme de panier, gel sur la commande, **TVA tranchée** (§8)        | 3                                       |
| 5   | **L'axe QUOI côté PIM** : table, écrans famille / fiche / déclinaison, remontée d'arbre      | —                                       |
| 6   | **Le fil** : `snapshot` v6, colonnes miroir, `min()` dans la garde                           | 1, 5                                    |
| 7   | **La boutique** : annonce, grisage des dates, refus ligne à ligne                            | 6 + lot 1 de `plan-boutique-sur-api.md` |

Deux remarques d'ordre :

- **Le lot 1 a une valeur propre.** Il ferme le trou entre un écran qui promet et
  un serveur qui ne refuse pas, et il ne demande rien au PIM. Tout le reste en
  dépend, parce que grâce, dérogation et surtaxe n'ont pas de sens tant que rien
  n'est refusé.
- **Le lot 5 est indépendant** et peut se mener en parallèle : il n'ajoute qu'une
  déclaration, sans consommateur, jusqu'au lot 6.

## 13. Ce qui a été vérifié, et où

| Affirmation                                                        | Vérifié                                                                    |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `OrderCutoff` existe, point × jour, heure locale                   | `apps/lfd-api/prisma/schema.prisma:1068-1092`                              |
| Résolution en quatre rangs, 12 tests                               | `packages/contracts/src/order-cutoff.ts`, `__tests__/order-cutoff.spec.ts` |
| **Aucun appelant** hors spec                                       | grep `resolveOrderCutoff\|orderCutoffInstant`, hors client généré          |
| `PlaceOrderHandler` ne vérifie que l'appartenance                  | `src/b2b/orders/application/commands/place-order.handler.ts`               |
| La page réglages porte déjà retraits + limites + zones             | `apps/lfc-B2B-admin-frontend/src/app/reglages/retraits-livraisons/`        |
| `PickupAddress` (public) et `PointOfSale` (pim) sans lien          | `schema.prisma:1024` et `:3124` ; grep `PointOfSale` dans `src/b2b` : vide |
| `PriceScopeType` = global/category/product/variant                 | `packages/contracts/src/pricing.ts:83`                                     |
| `Category.parentId` auto-relation                                  | `schema.prisma:2812-2845`                                                  |
| `ProductKind` = daily / made_to_order / resale                     | `schema.prisma:2766`                                                       |
| Snapshot en version 5, `syncVariantSchema`                         | `packages/catalog-sync/src/snapshot.ts:24,110`                             |
| `total = max(0, subtotal − discount) + deliveryFee + vat`          | `schema.prisma`, section `Order`                                           |
| `CartAdjustmentMode` sert déjà à `DeliveryZone` et `PickupAddress` | `schema.prisma:141, 1040, 1104`                                            |
| `DELIVERY_VAT_RATE = 20`, terme non-marchandise à son taux         | `src/b2b/orders/domain/services/vat.ts`                                    |
| `Order.requestedDeliveryDate` nullable                             | `schema.prisma`, section `Order`                                           |
| `placedByStaffId` → origine `back_office`                          | `src/b2b/orders/domain/services/order-origin.ts`                           |
| **Aucun `TZ`** dans le `Dockerfile` ni dans `wrangler.jsonc`       | `apps/lfd-api/Dockerfile`, `apps/lfd-api/wrangler.jsonc`                   |
| `lint:clock-port` ne scanne que `apps/lfd-api/src`                 | `dev-toolbox/gates/clock-port.mjs:36`                                      |
| La boutique lit un mock, pas une route catalogue                   | `apps/lfc-B2B-platform-frontend/src/app/client/mock-shop.ts`               |

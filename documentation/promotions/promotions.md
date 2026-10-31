# Les promotions

> ✅ **Doc d'état — état au 2026-10-31.** Le plan du chantier
> (lots L0 à L12, M1 à M7) et les deux plans du 2026-10-31 (un seul endroit,
> acheminements à cocher) sont bâtis, absorbés ici, puis supprimés ; leurs
> décisions encore utiles sont résumées au § 2.16.
>
> **En production** (`main` = `e35b566c9`) : L0 à M7, déclencheur compris, et
> les correctifs de justesse du § 2.13. **Sur `dev` seulement** : un seul
> endroit (§ 2.15), la page unique d'une promotion (§ 2.9) et les
> acheminements à cocher (§ 2.14). La reprise des commandes existantes
> (§ 2.12) **reste à jouer** ; tant qu'elle n'a pas rendu zéro écart, aucune
> promotion de panier cumulable ne se pose en production.
>
> **Études en cours, non bâties** :
> [`plan-jours-et-heures.md`](plan-jours-et-heures.md) (promotions
> récurrentes), [`plan-remises-acquises.md`](plan-remises-acquises.md) (la
> remise acquise face à la révision) et
> [`plan-remise-par-ligne.md`](plan-remise-par-ligne.md) (remise par ligne,
> prix barré).

---

## Partie 1 — en deux minutes

### Une promotion, en une phrase

Une promotion est **une réduction, pour un public, sur un mode
d'acheminement, sur une partie du catalogue, pendant une période**.

### Les quatre axes

```mermaid
flowchart LR
    P["Promotion<br/>−20 %, du 1er au 30"]
    P --> A["Public<br/>tout le monde · particuliers<br/>invités · inscrits · pros<br/>une société ± ses sites"]
    P --> B["Acheminement<br/>dans le prix affiché<br/>ou au panier : retrait et/ou livraison<br/>tous ou certains points, toutes ou certaines zones"]
    P --> C["Portée<br/>tout SAUF ... ou SEULEMENT ...<br/>familles · produits · déclinaisons"]
    P --> D["Conditions<br/>quantité minimale<br/>d'autres s'ajouteront"]
```

Une promotion a aussi :

- un **nom interne** (pour l'équipe) et un **libellé client**, en français,
  anglais et italien, qui peut différer pour les particuliers et pour les pros ;
- un **état** : active, en pause, archivée ;
- un **plancher** facultatif, sous lequel elle ne fait pas descendre le prix.

### D'une commande à son prix

Une promotion agit à **un seul** des deux endroits, selon son acheminement :

- **« dans le prix affiché »** → sur le **prix de chaque article**, quel que
  soit l'acheminement ;
- **« en remise au panier »** → sur le **total du panier**, une fois
  l'acheminement connu : retrait (tous les points ou certains) et/ou
  livraison (toutes les zones ou certaines), cochés ensemble dans UNE
  promotion (§ 2.14).

```mermaid
flowchart TD
    A["Prix de base de l'article"] --> B["Règles de prix<br/>société, volume, mercuriale"]
    B --> C{"Promotion<br/>« dans le prix affiché »<br/>qui vise ce client ?"}
    C -->|oui| D["Prix de l'article réduit"]
    C -->|non| E["Prix de l'article"]
    D --> F["Total du panier"]
    E --> F
    F --> G{"Promotion au panier<br/>qui admet cet acheminement<br/>et vise ce client ?"}
    G -->|oui| H["Remise sur le panier"]
    G -->|non| I["Total à payer"]
    H --> I
```

Par défaut, une promotion **ne se cumule pas** : si plusieurs visent le même
article, une seule s'applique — la plus précise sur le public (une société bat
« les pros », qui bat « tout le monde »), puis sur l'acheminement (un point ou une zone nommés battent « tous les
points » ou « toutes les zones »), puis la plus avantageuse.

Une promotion **cochée « Cumulable »** s'enchaîne avec les autres cumulables :
20 % puis 15 % du reste font −32 %, jamais −35 %. La meilleure des deux
formules (la non cumulable seule, ou la chaîne des cumulables) l'emporte pour
le client. Au panier, une commande peut ainsi porter **jusqu'à cinq remises**,
chacune avec sa ligne sur le bon, la facture et l'e-mail.

```mermaid
flowchart LR
    A["Panier"] --> B["Meilleure non cumulable<br/>par article"]
    A --> C["Chaîne des cumulables<br/>20 % puis 15 % du reste"]
    B --> D{"Le plus avantageux<br/>pour le client"}
    C --> D
    D --> E["Une ligne par remise<br/>bon, facture, e-mail"]
```

### Trois exemples

| Ce qu'on veut                                                    | Public                       | Acheminement               | Portée                           | Où elle agit      |
| ---------------------------------------------------------------- | ---------------------------- | -------------------------- | -------------------------------- | ----------------- |
| −20 % pour les pros au retrait La Folie Bakery, sauf les gâteaux | Pros                         | Un point : La Folie Bakery | Tout **sauf** la famille Gâteaux | Total du panier   |
| −20 % pour les particuliers inscrits et tous les pros            | Particuliers inscrits + Pros | Dans le prix affiché       | Tout                             | Prix de l'article |
| −5 € sur toute commande livrée                                   | Tout le monde                | Livraison, toutes zones    | Tout                             | Total du panier   |

Le premier cas est celui des anciennes « remises du point de retrait » : elles
sont **devenues des promotions** à la bascule. Le troisième se pose aujourd'hui
dans le modèle, et la boutique l'affiche depuis L10.

### Où on les règle

- **Tarification › Promotions**, et là seulement : toutes les promotions,
  « retrait à un point » compris (droit « tarifs B2B »). Un seul endroit
  depuis le 2026-10-31 (décision de Hugo, § 2.15) :
  la fiche d'un site ne parle plus de remises, elle décrit le lieu. L'écran
  Promotions se filtre par point, et un passage « en remise au panier » →
  « dans le prix affiché » y est une révision comme une autre (elle change de
  mécanique : du panier aux lignes, et l'annonce du point disparaît).
- L'ancienne grille s'appelle désormais **Règles de prix** ; elle ne pose plus
  de promotion (L12).

### Ce que voit le client

- **Au rayon** : le prix tient compte des promotions « dans le prix affiché »
  qui le visent ; une promotion de retrait ou de livraison est **mentionnée**
  (« −X % avec retrait à … ») sans changer le prix affiché.
- **Invité** : s'il existe une promotion réservée aux inscrits, il lit
  « Vous avez un compte ? Connectez-vous pour profiter de −X % ».
- **Panier, confirmation, e-mail, bons, facture** : une ligne par remise.
- **Remise d'un point de retrait** : une annonce par acheteur type —
  société active (`b2b`), société **en attente** (`b2bPending`),
  particulier (`b2c`). La boutique lit celle du statut de la société
  agissante (`pickupAnnouncementOf`). Une société en attente est `b2c` pour
  tout le reste (CGV, contact, livraison) mais la caisse la sert en pro :
  jusqu'au 2026-10-31 elle lisait l'annonce `b2c` et se voyait promettre une
  promotion « particuliers » que la caisse ne lui retirait pas.

---

## Partie 2 — pour aller plus loin

Le contexte est `apps/lfd-api/src/b2b/promotions/` (domain, application,
infrastructure, http). Les citations `fichier:ligne` des §§ 2.1 à 2.10 ont
été ouvertes le 2026-10-30 ; celles des ajouts du 2026-10-31 (L10, L12, cumul,
multi-remise) l'ont été le 2026-10-31.

### 2.1 Le modèle

| Axe                   | Code                                           | Valeurs                                                                                                                                                                                |
| --------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Effet                 | `domain/promotion-effect.ts:20-24`             | `percent_off`, `unit_amount_off`, `fixed_unit_price`, `basket_amount_off` ; effets admis par point `:31-36` (ligne : les trois premiers ; panier : `percent_off`, `basket_amount_off`) |
| Public                | `domain/promotion-audience.ts:15-25`           | `everyone`, `individuals`, `individuals_guest`, `individuals_registered`, `pros`, `pros_active`, `pros_pending`, `company`, `company_and_sites`, `everyone_but_active_pros`            |
| Public multiple (L8b) | `domain/promotion-audience-set.ts`             | un **ensemble normalisé** de cibles de l'arbre ; refus : vide, société en double, libellé d'audience sans audience (`errors/promotion-audience-errors.ts`)                             |
| Acheminement          | `domain/promotion-fulfillment.ts:25-37`        | `displayed_price`, ou `basket` avec `pickup` (`none` · `all` · `{points}`) et `delivery` (`none` · `all` · `{zones}`) — § 2.14                                                         |
| Point d'application   | `domain/promotion-fulfillment.ts:46-48`        | `displayed_price` → `line`, `basket` → `basket` (`applicationPointOf`)                                                                                                                 |
| Portée                | `domain/promotion-scope.ts:19-26`              | mode `all_except` / `only`, cibles `category` / `product` / `variant`                                                                                                                  |
| Conditions            | `domain/promotion-condition.ts:15`             | `min_quantity` seule ; union extensible                                                                                                                                                |
| Libellés              | `prisma/schema/public/promotions.prisma:15-27` | `label_*` (commun) + `label_individuals_*` + `label_pros_*`, FR/EN/IT                                                                                                                  |

Tables : `promotions`, `promotion_scope_rules`, `promotion_audience_targets`,
`promotion_settings` (`promotions.prisma`). La case « Cumulable » est la
colonne `promotions.cumulative` (`promotions.prisma:41`, défaut `false` ;
migration `20261031160000_les_promotions_cumulables`, et
`20261031190000_le_cumul_au_panier` qui retire le CHECK qui la bornait au
point ligne).

L'agrégat `domain/promotion.ts` : `pose` (`:76`), `revise` (`:133`), `pause`
(`:146`), `resume` (`:160`), `archive` avec motif obligatoire (`:176`). Une
promotion archivée est scellée (`ArchivedPromotionIsSealedError`). Une
promotion en pause garde sa place au refus de chevauchement.

### 2.2 Les deux points d'application

```mermaid
flowchart LR
    subgraph Ligne
      L1["promotionRulesFor"] --> L2["une règle de l'étage promotion"] --> L3["resolvePrice<br/>plancher, arrondi"]
    end
    subgraph Panier
      P1["BasketPromotions"] --> P2["basketPromotionPlanOf<br/>deux plans comparés"] --> P3["order_discounts<br/>une ligne par remise"]
    end
    L3 --> P1
```

**Pourquoi « dans le prix affiché » ne se limite pas à un acheminement**
(Hugo l'a demandé le 2026-10-31). Le prix d'un article au catalogue est
calculé **avant** que le client choisisse son acheminement, et il est le même
pour tous ceux qui le regardent. Une remise limitée au retrait à un point,
mise dans ce prix, afficherait à un client qui choisira la livraison un prix
qu'il ne paiera pas. D'où les deux formes :

| Forme                | Où la remise agit                  | Ce que voit le client au catalogue           | Limitable à un acheminement  |
| -------------------- | ---------------------------------- | -------------------------------------------- | ---------------------------- |
| Dans le prix affiché | le prix de chaque ligne (`line`)   | le prix déjà remisé                          | non : elle vaut partout      |
| En remise au panier  | le panier, une fois le mode choisi | une **annonce** (« −20 % avec retrait à … ») | oui : retrait, points, zones |

Piste notée, non bâtie : quand le client a déjà choisi son mode et son
point dans le contexte de commande de la boutique, le catalogue pourrait
afficher le prix remisé pour CE mode, et garder l'annonce tant qu'il ne l'a
pas choisi. Elle touche le calcul du prix affiché (argent) : plan et
`vitruve` avant tout bâti.

- **Ligne** : `pricing/domain/promotion-as-rule.ts` présente la promotion
  comme une règle de l'étage `promotion` ; `resolve-price.ts:262` l'ajoute aux
  règles. Même place, même scellement par la mercuriale, même plancher que les
  anciennes règles de promotion. Les cumulables passent par
  `resolveCumulativeStage` (`pricing/domain/cumulative-promotions.ts:40`).
- **Panier** : `orders/application/services/basket-promotions.service.ts`
  (`BasketPromotions`, `:41`), `basket-promotion-choice.ts`
  (`chooseBasketPromotion`, `:107`) et `basket-promotion-plan.ts`
  (`basketPromotionPlanOf`, `:71`) — § 2.11.
- **Spécificité et départage** : `domain/promotion-targeting.ts:184-205`
  (`PUBLIC_RANK` : société 4, société et sites 3, sous-publics 2, publics 1,
  tout le monde 0) ; le rang d'acheminement se calcule **pour le fait jugé**
  (`fulfillmentRankOf`, `:200` : point ou zone nommés 2, « tous » 1, prix
  affiché 0 — § 2.14). Au panier,
  le rang est `[public, acheminement, remise]` puis l'id
  (`basket-promotion-choice.ts:75`).

### 2.3 La source, la bascule, et l'ancien calcul retiré (L12)

`domain/promotions-source.ts:15` : la ligne `promotions_source`
(`promotion_settings`) n'a plus qu'**une** valeur admise, `promotions`. Ce
n'est plus un interrupteur mais un garde-fou : la migration
`20261031150000_le_resserrement_des_promotions` refuse une base qui n'a pas
basculé et resserre le CHECK. L'ancien chemin (`legacy`) et l'ombre
(`shadow`) sont **retirés du code** ; la promotion est la source unique du
prix promotionnel.

```mermaid
flowchart LR
    A["legacy<br/>règles d'étage promotion<br/>+ remise du site"] --> B["shadow<br/>(retiré en L12)"]
    B --> C["promotions<br/>seule valeur admise"]
```

- La bascule reste la migration `20261031130000_la_bascule_des_promotions` :
  `bascule_des_promotions()` rejoue la reprise, contrôle chaque source champ
  par champ, s'arrête en nommant tout écart, puis passe la source à
  `promotions`, dans une transaction. Ses retours arrière (et celui de la
  reprise) sont marqués **périmés** depuis L12 : il n'y a plus d'ancien code
  vers lequel revenir.
- Les anciens éditeurs refusent sans condition
  (`LegacyPromotionEditorClosedError`) ; les règles d'étage promotion encore
  vivantes ont été archivées avec leur acte.

### 2.4 La reprise

Migration `20261031120000_la_reprise_des_promotions` : les **remises de
retrait** des sites et les **règles d'étage promotion** deviennent des
promotions, par une fonction rejouable. Pré-contrôle en lecture seule :
`dev-toolbox/audits/promotions-reprise-precheck.mjs`. L'égalité des prix avant
et après a été prouvée par l'e2e d'égalité de L6 (`promotions-equality`, retirée en L12 avec
l'ancien chemin qu'elle comparait, 2026-10-30).

### 2.5 Les refus à la pose

| Refus                                                                                     | Erreur (`domain/errors/promotion-errors.ts`)                                                                                                     |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Deux promotions du même point qui se recouvrent (public, acheminement, portée, période)   | `OverlappingPromotionError` (`domain/promotion-overlap.ts:54`)                                                                                   |
| Deux promotions panier possibles pour une même commande, sauf si les deux sont cumulables | `BasketPromotionsWouldCombineError` (`assertSingleBasketPromotion`, `promotion-overlap.ts:110`)                                                  |
| Une sixième cumulable de panier qui pourrait s'appliquer avec cinq autres                 | `TooManyCumulativeBasketPromotionsError` (`promotion-errors.ts:325`) ; plafond `MAX_BASKET_DISCOUNTS_PER_ORDER = 5` (`promotion-overlap.ts:138`) |
| Un produit entier ciblé au point ligne                                                    | `PromotionProductTargetAtLineError` (`domain/promotion-terms.ts:108`)                                                                            |
| Effet non admis à ce point                                                                | `PromotionEffectPointMismatchError`                                                                                                              |
| Portée vide, fenêtre inversée, texte vide, effet hors bornes                              | `PromotionScopeIncludesNothingError`, `PromotionReversedWindowError`, `PromotionBlankTextError`, `PromotionInvalidEffectError`                   |

Le refus de chevauchement ne s'applique pas entre deux promotions
**cumulables**, ni au point ligne ni au panier. Le plafond de cinq est jugé
**à la pose**, deux à deux avec la candidate (publics, acheminements,
fenêtres) ; à la caisse, au-delà de cinq, les cinq premières dans l'ordre sont
gardées et les autres écartées et journalisées par `BasketPromotions` — le
devis et la passation ne lèvent jamais.

**Une révision identique n'écrit rien** (`95679aeed`) : reposer une promotion
sans changement ne trace plus d'acte « remplacée », et le bouton Enregistrer
reste inactif sur une fiche intacte (`domain/promotion-terms-equality.ts`).

### 2.6 La révision d'une commande (L9)

La commande garde la promotion panier appliquée
(`orders.discount_promotion_id`, `orders.prisma:262`). En révision, changer
d'acheminement ou de point d'une façon qui **ajoute, retire ou remplace**
cette promotion est refusé (409, `FulfillmentChangeAltersPromotionError`,
`orders/domain/services/fulfillment-promotion.ts:24`) : « Gardez le même
acheminement, ou annulez la commande et repassez-la ». Une commande d'avant
(id inconnu) est jugée sur sa remise figée. Avant L9, la remise était
recalculée au changement de point.

Depuis M3, L9 compare une **liste ordonnée** de remises : l'« avant » est lu
dans `order_discounts` si la commande y a des lignes actives, sinon dans les
colonnes (`fulfillment-promotion.ts`) ; le refus nomme le libellé figé de la
remise en cause. Un changement de quantité recompose les montants : dans une
seule transaction, les remises actives sont **archivées** (`archived_at`,
jamais supprimées) et le nouvel ensemble est inséré. Une cumulable visant un
point nommé passe avant une cumulable « au retrait » : changer de point peut
donc changer la remise de rang 1, et la révision est alors refusée (assumé
au lot M7, 2026-10-30). Depuis les acheminements à cocher, l'**adresse
livrée** compte parmi les changements jugés : la zone entre dans le fait,
une autre adresse peut retirer la promotion (§ 2.14).

### 2.7 Invité ou inscrit

`orders.buyer_kind` (`orders.prisma:130`, défaut `registered`) dit si la
commande vient d'un invité ou d'un inscrit ; reprise des commandes
existantes par la migration `20261031100000_la_porte_de_passation`. Côté
calcul : `PromotionBuyerKind` (`domain/promotion-targeting.ts:20`). Depuis
L10, cette porte d'entrée va jusqu'au **prix de chaque article** : les
publics invités / inscrits / pros en cours s'appliquent au point ligne, et
« une société et ses sites » lit le principal.

**Correctif d'horloge** (`db3efaa81`) : hors d'une requête HTTP (tâche de
fond, semis, handler appelé directement), le calcul du prix lisait
l'horloge deux fois ; la seconde lecture tombait une milliseconde plus tard,
passait en relecture datée et rendait **le prix pro à un invité**.
« Maintenant » est désormais lu une seule fois par la porte du prix, et une
relecture datée pour un lecteur public est refusée
(`DatedPublicPriceUnsupportedError`,
`orders/domain/errors/dated-public-price.error.ts:14`).

### 2.8 Libellés figés

Le libellé de la promotion panier, dans l'audience de l'acheteur, est **figé
à la passation** dans `orders.discount_label` (`orders.prisma:263-268`) : un
document relu plus tard ne dépend pas d'une promotion modifiée depuis.
L'audience du libellé : `labelAudienceOf` (`promotion-targeting.ts:142`).
Avec plusieurs remises, chaque libellé est figé dans sa ligne
`order_discounts.label`, et `orders.discount_label` vaut le libellé générique
« Remises / Discounts / Sconti » (§ 2.11).

### 2.9 Écrans et droits

| Écran                                                       | Front                                                       | API                                   | Droit                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| Promotions (liste, page d'une promotion, arbre des publics) | `apps/lfd-backoffice-frontend/src/app/targeted-promotions/` | `http/admin-promotions.controller.ts` | `b2b_pricing` (`:61`) ; lecture aussi sous `lfc_site_settings:read` |
| Règles de prix (ancienne grille)                            | —                                                           | `b2b/pricing/http/`                   | `b2b_pricing`                                                       |

Il n'y a plus de **surface** (d'où une promotion est réglée) depuis le
2026-10-31 : la route `admin/sites/:pickupId/promotions` (sous
`lfc_site_settings`), le fichier de la surface (retiré), `PromotionWrongSurfaceError` et
les cartes de remise de la fiche d'un site sont retirés (§ 2.15). Qui tenait
`lfc_site_settings:write` sans `b2b_pricing:write` ne règle plus la remise de
son point : le droit des prix s'accorde à l'écran (`/admin/staff-roles`).
Depuis le 2026-10-31 (décision de Hugo : « un seul layout avec les champs »),
une promotion n'a plus qu'**une page**, `promotions-ciblees/:id`
(`targeted-promotions/promotion-page/`) : ses champs directement éditables,
puis « Où en est-elle ? » (état, pause, reprise, archivage). Un résumé en une
phrase, en tête, suit la saisie (`apps/lfd-backoffice-frontend/src/app/targeted-promotions/promotion-summary.ts`). Lue sous
`b2b_pricing:read` ou `lfc_site_settings:read` ; sans `b2b_pricing:write`,
avant la bascule de la source ou une fois archivée, les mêmes champs sont
désactivés et rien ne s'enregistre. `nouvelle` (même composant) est gardée par
`b2b_pricing:write` seul ; l'ancienne adresse `:id/modifier` redirige vers
`:id`.

**Le genre de remise se choisit d'abord** (décision de Hugo du 2026-10-31,
comme les grandes plateformes : le type, puis un formulaire qui ne montre que
ce qui a du sens). Les cartes, dans l'ordre :

1. **« Quel genre de remise ? »** — un `fold-view-toggle` à deux choix
   illustrés : **Baisser le prix des articles** (`displayed_price` : le prix
   baisse au catalogue, pour tous les acheminements) ou **Remise sur le
   panier** (`basket` : limitable au retrait, à certains points, à la
   livraison, à certaines zones). Le sous-titre dit la conséquence pour le
   client. En lecture seule, les deux choix sont désactivés.
2. **« Que reçoit le client (valeur de la réduction) ? »** — les effets que le
   genre admet, ceux d'`EFFECTS_AT` côté serveur
   (`apps/lfd-api/src/b2b/promotions/domain/promotion-effect.ts`) : pourcentage,
   montant à l'unité ou prix posé pour baisser le prix ; pourcentage ou montant
   sur le panier pour la remise sur le panier. Puis les libellés et le nom
   interne.
3. **« Pour qui (définir l'audience) ? »** — l'arbre des publics.
4. **« Sur quel mode d’acheminement et de consommation ? »** — **seulement**
   en remise sur le panier (détail ci-dessous).
5. **« Sur quels articles ? »** — familles et déclinaisons pour baisser le
   prix, familles et produits pour le panier (`targetsFor`).
6. **« Quand, et à quelles conditions ? »** — période, quantité minimum,
   cumul ; « Aussi pour les clients à tarif négocié » **seulement** pour
   baisser le prix (le panier ne la porte pas).
7. **« Où en est-elle ? »** — une promotion existante seulement.

Changer de genre dans une saisie met de côté ce que le genre quitté a en
propre — son effet, ses cibles (déclinaisons ou produits), « tarif négocié » —
et le rend au retour (`switchType`, `promotion-draft.ts`) : un aller-retour ne
perd rien, et le corps envoyé ne porte que le genre choisi. Un effet que le
nouveau genre lit suit la première bascule ; un autre repart vide plutôt que
relu dans une autre unité. Le retrait et la livraison restent dans le
brouillon, ignorés hors panier.

**L'acheminement se coche** (2026-10-31, modèle au § 2.14). En remise sur le
panier, la carte « Sur quel mode d’acheminement et de consommation ? » porte
deux cases, **Retrait** et **Livraison** ; sous chaque case
cochée, « Tous les points » / « Certains points » (ou « Toutes les zones » /
« Certaines zones ») et, pour « certains », un `fold-multiselect` des sites
actifs ou des zones (`GET /delivery-zones`). Un point archivé que la
promotion garde reste dans la liste, suffixé « (archivé) » — son nom vient de
la palette des sites ; sans la liste des points actifs, rien n'est dit
archivé. Rien de coché, ou une sélection vide, est une saisie incomplète (le
serveur refuse aussi). Le brouillon porte l'ensemble entier
(`promotion-draft.ts`, `DraftReach` par côté — une case décochée garde sa
sélection) ; le résumé le dit (« au retrait à L'adroit et en livraison dans
la zone Centre »), la liste aussi (« Retrait · … + Livraison · … »), et
« Dupliquer pour un autre public » le recopie. Le filtre de la liste par
point est tenu par le serveur (`?pickupId=`).

### 2.10 Journal

Actes `posed`, `paused`, `resumed`, `archived`, `replaced`
(`domain/promotion-act.ts:17`), sujets `promotion.*`. En mode `shadow`, un
écart est journalisé `promotions.shadow_divergence`.

---

### 2.11 Le cumul, et plusieurs remises de panier (§ 16, M1 à M7)

**Au point ligne** (L12, `32e205d4b`) : les non cumulables désignent leur
gagnant comme avant ; les cumulables forment une chaîne triée par rang puis
par id, chacune sur le prix sortant de la précédente, en exact ; le plus bas
des deux l'emporte (à égalité, la non cumulable) ; le plancher arrête la
descente. Une étape de trace par promotion appliquée.

**Au panier** (M7, `31d15f3ee`) : `basketPromotionPlanOf` retient une non
cumulable par article (rangs disjoints) et la chaîne des cumulables, puis
compare deux plans **dans l'unité de la commande** — en TTC pour une commande
`exact_ht` (le particulier), en HT pour `line_ht` (le pro). À égalité, le plan
non cumulable. Chaque étape remise le **reste exact** des lignes qu'elle
couvre, arrondie une fois au centime ; la somme des étapes affichées est la
remise totale. Une seule remise donne le prix d'hier au centime.

**Une promotion qui ne retire rien ne concourt pas** (`0c43647b9`) : une
promotion plus spécifique mais sans article commun avec le panier (ou dont le
seuil n'est pas atteint) gagnait sur son rang et figeait une remise de 0 c à
la place d'une vraie (`basket-promotion-choice.ts:102-116`).

```mermaid
sequenceDiagram
    participant Q as Devis ou passation
    participant B as BasketPromotions
    participant P as basketPromotionPlanOf
    participant O as Commande
    participant D as order_discounts
    Q->>B: candidates du panier
    B->>P: non cumulables et cumulables, cinq au plus
    P-->>B: plan retenu, une étape par remise
    B->>O: remises ordonnées
    O->>D: une ligne par remise, parts par taux
```

**La persistance** — migration `20261031170000_les_remises_de_panier` :

| Table                     | Ce qu'elle porte                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `order_discounts`         | une ligne par remise : `rank` (ordre d'application figé), promotion, ajustement, libellé figé, montant, parts par taux, `origin` (`computed` / `frozen`), `archived_at` |
| `order_line_discounts`    | quelles lignes chaque remise couvre                                                                                                                                     |
| `delivery_note_discounts` | les parts de chaque remise **sur un bon parti**                                                                                                                         |

Les colonnes d'avant restent écrites : `discount_cents` est le total ; avec
plusieurs remises, `discount_promotion_id`, `discount_adjustment` valent
`NULL` et `discount_label` le libellé générique. Le repli unique
`frozenBasketDiscountsOf` (`orders/domain/services/frozen-basket-discounts.ts:60`)
lit la table si la commande y a des remises actives, sinon les colonnes comme
une remise de rang 1.

**Le déclencheur** — migration `20261031180000_le_controle_des_remises` : un
déclencheur de contrainte différé refuse au commit une commande dont la somme
des remises actives ≠ `discount_cents`, ou dont les parts par taux ne somment
pas le montant. Il ne se déploie qu'au **temps 5 du runbook** (§ 2.12).

**Les lecteurs** :

- **Bons** (M4) : bon complet, partiel, reliquat (un % se recompose sur chaque
  envoi, un montant fixe compte entier sur le premier bon), manquants ; le
  papier porte une ligne par remise s'il en a plusieurs. La couverture se lit
  par SKU ; `SplitSkuCoverageError` refuse un SKU couvert à moitié.
- **Facture et Factur-X** (M5) : une remise de document (BG-20) **par
  promotion et par taux**, motif = libellé figé en français, repli « Remise »,
  sans BT-93/94. Tant qu'aucune commande de la facture n'a plusieurs remises,
  la facture garde la clé unique et le motif « Remise client », octet pour
  octet. Des parts qui ne tombent pas juste : facturée au bon montant sous la
  clé unique, et journalisé.
- **Affichage** (M6, M7) : la commande sert `discounts[]` seulement quand
  elle en porte plusieurs ; bon de commande, e-mail (langue du destinataire),
  récapitulatif du back-office, ticket, panier et confirmation de la boutique
  (`ShopQuoteView.discounts`) écrivent une ligne par remise.
- **Assumé** : l'annonce d'un point et l'offre de connexion n'annoncent
  qu'**une** remise, la plus spécifique ; la caisse peut en retirer davantage.
  L'annonce d'un point est faite à un acheteur type sans identité ni porte
  d'entrée (`domain/pickup-discount-announcement.ts`) : un public « société »,
  « invités » ou « inscrits » n'y est pas annoncé (sous-annonce). Les publics
  qui ne dépendent que du statut de la société sont exacts pour les trois
  acheteurs types, société en attente comprise (`b2bPending`, 2026-10-31).

### 2.12 La reprise des remises existantes, et son runbook

Le script `apps/lfd-api/prisma/backfill-order-discounts.ts`
(`pnpm --filter lfd-api backfill:order-discounts`) remplit `order_discounts`
pour les commandes d'avant M3 par la même arithmétique que la passation. Il
tourne **à blanc** par défaut, `--write` après lecture du compte par Hugo ;
une cible non locale demande `--production` et le nom de la base retapé.
Une commande dont la recomposition ne redonne pas le figé est écrite
`origin = 'frozen'` (valeurs figées recopiées, listée au rapport) ou, à
plusieurs taux, listée « à trancher » sans être écrite. `--refresh-drifted`
traite les commandes révisées entre deux passes.

Le plan du chantier prévoyait M2, une passe, M3–M6, une seconde passe, le
déclencheur, puis M7. **Ce qui a été joué** (2026-10-31, pré-release, aucune
activité commerciale) : tout d'un coup, déclencheur et M7 compris. Ce qui
reste :

```mermaid
flowchart TD
    A["Déployé le 2026-10-31<br/>M2 à M7 et le déclencheur"] --> B["Passe à blanc<br/>compte lu par Hugo"]
    B --> C["--write --production nom"]
    C --> D["Seconde passe<br/>et --refresh-drifted"]
    D --> E{"Zéro écart<br/>et zéro désaccord ?"}
    E -->|non| D
    E -->|oui| F["Promotions de panier cumulables<br/>posables en production"]
```

M7 est irréversible : dès qu'une commande porte deux remises, sa facture, son
Factur-X et ses bons les portent pour toujours.

### 2.13 La justesse, éprouvée le 2026-10-31

- **Factur-X à plusieurs promotions** : la pièce témoin
  `promotions-cumulees-deux-taux` (`facturx-samples.ts`) passe au Schematron
  EN 16931 officiel des specs, à veraPDF (`verify:facturx-pdf`) et, une fois
  à la main, à **Mustang** 2.26.0, validateur tiers : les dix pièces témoins
  `valid`, un total falsifié refusé (BR-CO-15, BR-CO-16). Mustang n'est pas
  dans la CI.
- **De bout en bout** : `test/promotions-basket-cumul-two-rates.e2e-spec.ts`
  — commande pro à deux taux, deux cumulables, de la passation à la facture.
- **Annonce contre caisse** :
  `orders/domain/services/__tests__/announcement-vs-checkout.spec.ts` — le
  retiré est toujours au moins l'annoncé. Il a trouvé une sur-annonce : le
  membre d'une société en attente lisait l'annonce des particuliers ; un
  point annonce désormais `b2bPending` (contrat `AnnouncedPickupDiscounts`).
- **Offre de connexion** : elle n'est plus faite quand la quantité minimum de
  la promotion n'est atteinte par aucune ligne (`promotion-offers.ts`).
- **« Mes commandes »** : à plusieurs remises, une ligne par remise sans
  assiette (`order-discount-lines.ts`) — l'ancienne mention écrivait la somme
  sur une base qui n'était celle d'aucune.

### 2.14 Les acheminements à cocher (2026-10-31, sur `dev`)

Demande de Hugo : « Retrait et livraison devraient être des cases à cocher,
car on pourrait avoir un seul point et la livraison », puis l'extension aux
zones. Contredit deux fois par `vitruve` ; serveur au commit `0dec40d6e`,
écran le même jour (§ 2.9).

**Le modèle** (`domain/promotion-fulfillment.ts:25-37`) :

```ts
type PromotionFulfillment =
  | { kind: "displayed_price" } // l'ancien `any` : point LIGNE
  | { kind: "basket"; pickup: "none" | "all" | { points }; delivery: "none" | "all" | { zones } };
```

- **Invariants** (agrégat, pose et révision) : une promotion `basket` coche
  au moins un acheminement (`PromotionReachesNothingError`) ; une liste n'est
  jamais vide, sans doublon ni blanc ; un point ou une zone inconnus sont un
  refus nommé (`PromotionUnknownFulfillmentTargetError`), jamais une
  violation de clé étrangère (`domain/errors/promotion-fulfillment-errors.ts`).
  Points et zones sont **triés** à la construction (`canonicalFulfillment`) :
  reposer la même liste dans un autre ordre n'est pas une révision.
- **Le fait jugé** (`promotion-targeting.ts:59-61`) : `{ method: "pickup",
pickupId }` ou `{ method: "delivery", zoneId }`. Admission
  (`fulfillmentAdmits`, `:176`) : un point est admis par « tous les points »
  ou s'il est nommé ; une zone, par « toutes les zones » ou si elle est
  nommée. Un point pas encore choisi (devis anonyme) ou une livraison sans
  zone ne sont admis que par « tous ».
- **La zone se résout par le code postal**, par la règle même des frais
  (préfixe le plus long), exposée aux commandes par le port
  `DeliveryZoneOfPostalCodeReader`
  (`orders/domain/ports/delivery-zone-of-postal-code.reader.ts`) que
  `delivery-zones` implémente. À la caisse, une livraison sans zone est
  refusée avant (`NoDeliveryZoneForPostalCodeError`) ; « sans zone » ne
  concerne que l'annonce et les témoins de recouvrement.
- **Rang par fait** (`fulfillmentRankOf`, `:200`) : point ou zone nommés 2,
  « tous » 1, prix affiché 0. Deux promotions disjointes ne se comparent
  jamais : A = {point P1, toutes zones} et B = {tous points, zone Z} — en Z,
  B passe avant A ; en P1, A avant B.
- **Recouvrement d'ensembles** (`fulfillmentsMeet`,
  `promotion-overlap.ts:291`) : deux promotions se recouvrent si une
  commande peut être servie d'une façon que les deux admettent ; témoins :
  chaque point et chaque zone nommés, « un autre point », « une autre zone »,
  « livraison sans zone ».
- **Ports, sans cycle** (`appBootstrap/promotion-fulfillment-targets.module.ts`) :
  `promotions` déclare `DeliveryZoneDirectory` et `PickupPointDirectory`
  (existence et libellés) ; `delivery-zones` déclare
  `PromotionsTargetingZoneReader`. Aucun module n'importe l'autre.
- **Une zone nommée ne se supprime pas** : `DeliveryZoneTargetedByPromotionError`
  (409, `delivery-zones/domain/delivery-zone-errors.ts:25`), **promotion
  archivée comprise** — contrôle et suppression dans la même transaction, la
  zone verrouillée ; la clé étrangère `promotion_delivery_zones.zone_id` est
  `RESTRICT`. Un point de retrait, lui, s'archive et ne se supprime pas : il
  reste dans la promotion et n'admet plus rien.
- **Journal** : les nouveaux faits nomment les points et les zones par leurs
  libellés ; les faits passés restent tels qu'écrits.
- **Contrat de la boutique** (`packages/contracts/src/promotion-offer.ts`) :
  une offre porte l'ensemble (`pickup`, `delivery`) ; la boutique dit « au
  retrait à … » ou « en livraison » selon ce que le client regarde. Cassé
  dans le même déploiement (pré-release).

**Les données** — migration `20261031200000_les_acheminements_a_cocher` :
deux colonnes de mode, `fulfillment_pickup` et `fulfillment_delivery`
(`none` · `all` · `listed`, `NULL` au point ligne), deux tables de liaison
`promotion_pickup_points` et `promotion_delivery_zones` (clés primaires
composées, FK `RESTRICT`), les CHECK de la forme neuve, et la correspondance
une à une :

| Ancien `fulfillment_kind` | Nouveau                                      |
| ------------------------- | -------------------------------------------- |
| `any`                     | `displayed_price`                            |
| `pickup`                  | `basket`, `pickup = all`, `delivery = none`  |
| `pickup_point` + id       | `basket`, `points = [id]`, `delivery = none` |
| `delivery`                | `basket`, `pickup = none`, `delivery = all`  |

La migration s'arrête en le nommant si le point d'une promotion « un point »
n'existe pas. **Colonnes mortes** : `fulfillment_kind` (devenue nullable) et
`fulfillment_pickup_id` restent en base, ni lues ni écrites (CLAUDE.md § 0) ;
`application_point` reste un miroir dérivé. Les commandes ne sont pas
touchées : elles figent leurs remises (`order_discounts`). L'e2e
`test/promotions-fulfillment-migration.e2e-spec.ts` relit chaque ancienne
forme ; `test/promotions-point-and-zone.e2e-spec.ts` éprouve « un point + une
zone » en une promotion.

**Retour arrière et vérification après déploiement** — le retour arrière
n'est **pas gratuit** dès le déploiement :
`apps/lfd-api/prisma/rollback/20261031200000_les_acheminements_a_cocher.sql`
se joue à la main, par l'URL directe, **avant** le retour du code, puis l'API
redémarre. Il recalcule les colonnes anciennes depuis la forme neuve et
**archive** chaque promotion non archivée qu'elles ne savent pas dire (un
point et la livraison, plusieurs points, des zones choisies), réduite à son
premier élément. Après le déploiement, vérifier : la migration inscrite
appliquée, chaque promotion lisible à l'écran Promotions avec le même
acheminement qu'avant (la table ci-dessus), et aucune promotion `listed` sans
ligne de liaison (erreur de lecture nommée, jamais un ensemble vide
silencieux).

```mermaid
flowchart TD
    A["Commande : retrait au point P<br/>ou livraison au code postal C"] --> B["Fait d'acheminement<br/>pickupId, ou zoneId résolu par C"]
    B --> C{"fulfillmentAdmits<br/>pour chaque promotion basket"}
    C -->|admise| D["Rang par fait<br/>nommé 2, tous 1"]
    C -->|non| E["Écartée"]
    D --> F["basketPromotionPlanOf<br/>§ 2.11"]
```

Hors champ : le mode de **consommation** (sur place / à emporter) n'a pas de
donnée côté commande en ligne ; seul le titre de la carte le nomme.

### 2.15 Un seul endroit (2026-10-31, sur `dev`)

Décision de Hugo : « La réduction de retrait sur un site doit aller dans
promotion générale, on ne peut pas avoir deux endroits », et « on peut
laisser la page réglage d'un site agnostique de comment le commerce le
traite ». Contredit par `vitruve` le même jour.

- **Une seule route** : `admin/promotions` (`http/admin-promotions.controller.ts`),
  sous `b2b_pricing`, pour toute promotion. La route
  `admin/sites/:pickupId/promotions` (écritures et `GET`) est retirée ; la
  liste se filtre par `?pickupId=`.
- **Plus de surface** : le paramètre `surface` des cinq commandes, son garde
  dans `PromotionWriteGuard` et `PromotionWrongSurfaceError` sont retirés ;
  le garde ne juge plus que la source et le recouvrement.
- **La fiche d'un site ne parle plus de remises** : les cartes de remise et
  de promotions du point sont sorties de la page (Réglages › Sites).
- **Le droit qui bouge** : qui tenait `lfc_site_settings:write` sans
  `b2b_pricing:write` ne règle plus la remise de son point (perte assumée,
  pré-release) ; le droit des prix s'accorde à l'écran, jamais par
  migration. Rien ne s'ouvre à un droit qui ne l'avait pas.
- Aucune migration ; retour arrière par le code seul. Régression :
  `test/promotions-one-place.e2e-spec.ts`. Non fait au bâti : la lecture en
  production des rôles qui avaient `lfc_site_settings:write` sans
  `b2b_pricing:write`.

### 2.16 Les décisions qui restent utiles (résumé, datées)

Le plan du chantier (2026-10-30, supprimé le 2026-10-31) portait la
discussion ; voici ce qui en reste opposable.

- **Qui pose une promotion** (décision du 2026-09-03, document supprimé le
  2026-10-31) : la plateforme commerciale, pas le référentiel produit. La
  question était de faire tourner une même campagne sur l'ancien canal de
  vente en ligne et sur la plateforme ; ce canal est retiré depuis le
  2026-10-16, la question est close.
- **Un droit à part pour les promotions, quand il le faudra** (même
  décision, § 7, toujours vrai) : les promotions sont sous `b2b_pricing`,
  qui permet aussi de poser une mercuriale sur un compte. Un rôle qui doit
  poser des promotions publiques sans toucher aux prix négociés demandera
  une ressource `b2b_promotions` détachée de `b2b_pricing` — un droit ne se
  découpe pas dans l'écran seulement. Plus vrai encore depuis § 2.15 (un seul
  endroit, sous `b2b_pricing`).

- **Un modèle global** (Hugo, 2026-10-30) : la remise d'un point de retrait
  est une promotion comme une autre, pas un second système ; le modèle est
  **extensible** — chaque axe est un type somme, un critère neuf est une
  variante et son évaluateur ; les conditions sont une liste typée (seule
  `min_quantity` est bâtie ; panier minimum, jours et heures, première
  commande, code promo, limite d'usage sont prévus).
- **Vocabulaire** (Hugo, 2026-10-30) : _audience_ (particuliers, pros, tout
  le monde) ; _sous-audience_, ce que le serveur reconnaît seul (invités,
  inscrits ; pros actifs, en cours d'inscription, une société ± ses sites) ;
  _segment_, une liste entretenue par le staff — chantier séparé, rien en
  base.
- **Invité ou inscrit** (Hugo, 2026-10-30) : un particulier qui commande
  sans se connecter est invité, même si son adresse a un compte ; l'offre de
  connexion s'affiche à **tout** invité tant qu'une promotion « inscrits »
  vit, sans jamais révéler qu'une adresse a un compte.
- **Le pro en cours d'inscription** est un pro, pas un particulier (Hugo,
  2026-10-30) ; ses réglages vivent dans
  [`plan-pros-en-cours-d-inscription.md`](../comptes-client/plan-pros-en-cours-d-inscription.md).
- **Deux points d'application, cumul entre eux** (2026-10-30) : la ligne
  (l'étage `promotion`, scellable par la mercuriale, bornée par la limite de
  prix) puis le panier (sans scellement ni limite de prix). Dans un même
  point, la plus spécifique — **public > acheminement > portée** — puis la
  plus avantageuse, puis l'id. Une société nommée bat tout public de
  clientèle, même moins généreuse (Q5 : la négociation nominative prime).
- **Reproduire l'existant au centime** à la reprise : public
  `everyone_but_active_pros` pour l'ancienne remise « particuliers »
  (exactement `audienceOf`), `basket_amount_off` pour le montant fixe,
  `fixed_unit_price` pour une règle `replace` ; `increase` et `segment`
  arrêtaient la reprise en les nommant.
- **Pas de contrainte d'exclusion en base** : le recouvrement se juge à la
  pose sur la projection du catalogue (§ 2.5).
- **Au rayon**, une promotion de panier ne baisse jamais le prix affiché ;
  elle est mentionnée, sans barré.
- **Révision** (option b, 2026-10-30) : refuser un changement d'acheminement
  qui ajoute, retire ou remplace la promotion de panier, avec le geste de
  sortie (§ 2.6).
- **Plusieurs publics et libellés par audience** (L8b, Hugo, 2026-10-30) :
  un ensemble minimal non vide, « tout le monde » exclusif ; nom interne
  séparé des libellés ; libellés Particuliers et Pros, repli sur le commun.
- **Cumul sur demande** (Hugo, 2026-10-30) : non cumulable par défaut ;
  « Cumulable » enchaîne en successif ; la meilleure des deux formules, à
  égalité la non cumulable (§ 2.11).
- **Reprise des remises de panier** (mandat, 2026-10-30) : une commande en
  écart s'écrit `origin = 'frozen'` ; `--production` et le nom de la base
  retapé ; zéro écart **et** zéro désaccord avant de poser une cumulable de
  panier (§ 2.12). Q-M2 (2026-10-30) : une même promotion figée sous deux
  libellés sur une facture prend le libellé du bon le plus ancien.

### 2.17 L'origine des exclusions

La portée `all_except` / `only` vient de l'ancienne **remise de retrait par
clientèle** (plan du 2026-10-22, « une remise par clientèle, avec ses
exclusions par famille et par produit », supprimé le 2026-10-31) : ses
exclusions et son assiette éligible ont été reprises telles quelles par les
promotions à la bascule (L12), qui les ont remplacées.

---

## Limites connues et reste à faire

- **Production** : la reprise du § 2.12 reste à jouer ; un seul endroit,
  page unique et acheminements à cocher attendent le prochain « pousse
  main ». Contrôle préalable non fait : les rôles qui avaient
  `lfc_site_settings:write` sans `b2b_pricing:write` (§ 2.15).
- **Remise par ligne vérifiable par le client, prix barré** :
  [`plan-remise-par-ligne.md`](plan-remise-par-ligne.md), option documentée,
  non bâtie.
- **Jours et heures, remises acquises** : études en cours,
  [`plan-jours-et-heures.md`](plan-jours-et-heures.md) et
  [`plan-remises-acquises.md`](plan-remises-acquises.md).
- **Comparaison avec Salesforce B2C Commerce** (écarts classés par valeur et
  coût) : [`comparaison-salesforce.md`](comparaison-salesforce.md).
- **Annonce et offre de connexion** : une seule remise annoncée, même quand
  la caisse en cumule plusieurs (assumé : sous-annonce, jamais sur-annonce —
  § 2.13).
- **Dette du bon partiel, non aggravée** : un montant fixe est borné à
  l'assiette du premier bon ; si elle est plus petite, la somme des bons est
  inférieure à la remise de la commande.
- **Améliorations notées** : prix affiché remisé pour le mode déjà choisi
  dans le contexte de commande (§ 2.2) ; onglets dans Tarification ; promotions affichées
  dans la grille des règles de prix.
- **Limite actuelle** : cinq remises de panier au plus par commande ; une
  seule condition (`min_quantity`).

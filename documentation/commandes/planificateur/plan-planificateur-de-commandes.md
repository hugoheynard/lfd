# Le planificateur de commandes des pros

> 📝 **Plan, rédigé le 2026-11-27.** Demande d'un client pro, portée par
> Hugo le même jour : **pros seulement pour le moment**. Les décisions Q1–Q10
> du § 8 sont **toutes prises par Hugo le 2026-11-27, telles que proposées** ;
> bâti ordonné le même jour. Contredit par `vitruve` le même jour
> (3 bloquants, 5 sérieux), intégrés ou assumés au § 9.

## 1. En deux mots

Un pro prépare ses commandes **à l'avance, jour par jour**, sur un seul
écran. Chaque jour est une colonne, et chaque colonne est un panier. Les
articles viennent d'une **liste d'envies** remplie depuis la boutique, et se
glissent dans les jours. Quand les commandes de ce jour ferment, la colonne
**devient une vraie commande**, qui suit le chemin habituel (fournil,
colisage, retrait ou livraison, facture).

```
┌──────────────────────────────────────────────────────────────────────┐
│ À partir du [ 01/12/2026 ▾ ]                                         │
├──────────────────────────────────────────────────────────────────────┤
│ Site : Café des Halles · Livraison, 7 h – 9 h        [changer]       │
├──────────────┬──────────────┬──────────────┬──────────────┬─────────┤
│ Liste        │ lun. 1 déc.  │ mar. 2 déc.  │ mer. 3 déc.  │         │
│ d'envies     │ 84,20 € HT   │ 0,00 € HT    │ 61,00 € HT   │   ＋    │
│              ├──────────────┼──────────────┼──────────────┤ un jour │
│ Croissant    │ Croissant ×40│              │ Baguette ×30 │ de plus │
│ Baguette     │ Pain choc ×20│              │              │         │
│ Pain choc.   │              │              │              │         │
│ [Ouvrir la   │  ⇢ fermé à   │              │              │         │
│  boutique]   │  mar. 14 h   │              │              │         │
└──────────────┴──────────────┴──────────────┴──────────────┴─────────┘
       glisser ─────────▶ dans un jour, ou d'un jour à l'autre
```

Les règles, d'où découle tout le reste :

1. **Une colonne est un brouillon tant que le jour est ouvert.** Elle ne
   réserve rien et ne bloque aucun stock. Le fournil ne la voit pas. Elle ne
   devient une commande qu'à la fermeture, comme si le client avait cliqué
   « Commander » à ce moment-là.
2. **Une seule arithmétique.** Le total affiché en tête de colonne est le
   devis de la boutique (`POST /shop/quote`), et la commande se compose par
   `OrderDrafting`. Le planificateur ne calcule aucun prix. Le prix facturé
   est celui du jour de la conversion, et l'écran le dit (« prix indicatif »).
3. **Jamais une commande amputée.** Si une ligne ne passe plus au moment de
   la conversion (article retiré, réservé ailleurs, limite dépassée), la
   colonne n'est pas convertie. Le client le voit sur sa colonne, et le
   staff est averti. C'est la règle du planificateur récurrent, que l'on
   reprend telle quelle (Q2).
4. **Une machine n'a aucun passe-droit.** La conversion passe par la porte du
   client : aucune dérogation d'heure limite, aucun frais de retard, aucun
   dépassement de limite.
5. **Une colonne donne au plus une commande.** La conversion est scellée en
   base par l'unicité sur la colonne. Rejouer le balayage ne double rien.
6. **Une colonne gelée ne se modifie plus.** Dès son instant de conversion,
   l'agrégat refuse toute écriture du client (« ce jour se commande, modifiez
   la commande »). Ce que la commande porte est donc ce que l'écran montrait.

## 2. Ce qui existe déjà et que l'on réutilise (vérifié le 2026-11-27)

Le planificateur des paniers récurrents a bâti presque toute la mécanique de
conversion. Celui-ci en est un cas plus simple : une seule date, pas de
rythme.

| Pièce                                                                          | Où                                                                                                                            | Ce qu'on en fait                                                                                                           |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| La porte « passe cette échéance », déclarée par le bloc, faite par le commerce | `recurring/channels/commerce/occurrence-placement.ts`                                                                         | la **forme** à copier : demande (acheteur, société, acheminement, créneau, lignes, CGV) → `placed` ou `refused` avec cause |
| La composition sans passe-droit                                                | `RECURRING_OCCURRENCE_POLICY`, `orders/application/services/order-drafting.service.ts`                                        | une politique sœur pour le planificateur, ou la même si rien ne diffère (à trancher au bâti, L2)                           |
| Le passage d'une échéance                                                      | `orders/application/services/recurring-occurrence-placement.ts`                                                               | le modèle du handler de conversion                                                                                         |
| Le balayage                                                                    | `recurring/occurrence/http/recurring-occurrences-sweep.controller.ts`, `hourlySweeps` dans `apps/lfd-api/container/worker.ts` | même forme : `RecomputeGuard`, `@Idempotent`, lots bornés                                                                  |
| La cloche du staff sur un refus                                                | R5 du planificateur récurrent (`OccurrenceIssueBell`)                                                                         | même geste, un autre titre                                                                                                 |
| L'heure limite                                                                 | `lafoliecoffee/order-cutoffs/application/deadline/order-deadline.ts`                                                          | seul juge de « trop tard ? » (`lint:order-deadline-door`) ; la limite peut varier **par article**                          |
| Le panier                                                                      | `src/shop-cart/`, schéma `cart`                                                                                               | la forme d'un bloc sans clé étrangère, un par (personne, espace)                                                           |
| Le devis                                                                       | `POST /shop/quote`                                                                                                            | le total de chaque colonne                                                                                                 |
| Les gestes d'une case de vitrine                                               | `apps/lfc-ecommerce-frontend/src/app/client/shop/storefront/storefront-actions.ts` (`productAdded`)                           | le mode « liste d'envies » y branche un autre destinataire                                                                 |

Ce qui **n'existe pas** :

- **aucune liste d'envies** dans l'API ni dans la boutique ;
- **aucun glisser-déposer** dans la boutique : `@angular/cdk` n'y est pas
  installé, et le seul glisser du dépôt est fait à la main dans l'éditeur
  d'e-mails du back-office.

## 3. Le modèle

### 3.1 Un contexte du bloc `recurring/` : `recurring/planned/`

Le bloc des paniers récurrents a déjà tout ce que la conversion demande : le
canal que le commerce implémente (`recurring/channels/commerce/`), le
balayage, la cloche du staff (`OccurrenceIssueBell`), le registre des issues
et ses faits. Un jour planifié est une **échéance sans rythme**. Un bloc à
part aurait dupliqué tout cela, ajouté un schéma, une ligne à la matrice de
`CLAUDE.md` et une seconde implémentation côté commerce, et la décision
serait devenue irréversible à la première migration (objection 7).

Le planificateur est donc un **contexte** de `recurring/`, à côté de
`basket/` et `occurrence/`, dans le schéma `recurring` :

- il partage le canal : le commerce implémente déjà « passe cette
  échéance », et le planificateur l'appelle avec une **provenance** de plus
  (`planned_day` au lieu de `subscription`) ;
- il ajoute au canal une seule lecture, **« que dirait la passation de ce
  panier ? »** (`PlannedBasketCheck`, § 4 bis), que le commerce implémente
  avec les mêmes juges que la passation : pour chaque ligne, son heure de
  fermeture et, si elle bloque, la cause et la phrase ;
- `recurring → lafoliecoffee` reste interdit, la matrice ne change pas.

Le nom du bloc ne dit plus tout (« récurrent »), et c'est le prix assumé : à
renommer le jour où un troisième usage apparaîtra (Q10).

### 3.2 Les tables

```
recurring.planned_columns   (bâtie sous ce nom)
  id                 ULID
  user_id            l'acheteur (opaque)
  company_id         la société, NON nul : pros seulement
  site_key           le site choisi (opaque, cf. Q4)
  service_day        AAAA-MM-JJ
  routing            jsonb : méthode, adresse ou point de retrait, créneau
  lines              jsonb : [{ sku, quantity }]
  status             draft | placed | refused | missed
  converts_at        l'instant de gel et de conversion (§ 4)
  order_id           opaque, posé à la conversion
  refusal_cause      code stable, refusal_reason la phrase
  version            entier, pour l'écriture concurrente (deux onglets)
  window_start, window_end   le créneau, sorti du routing pour l'unicité
  UNIQUE (company_id, service_day, window_start, window_end)
    -- partielle : hors colonnes retirées ; le site est la société

les favoris : public.shop_favorite, déjà en production (§ 6.2)
```

**L'acheminement est porté par la colonne, pas seulement par l'écran.** La
première ligne de l'écran le choisit pour tout le planificateur, mais chaque
colonne le recopie à son écriture. Changer de site ou de créneau ne réécrit
pas en silence les jours déjà remplis : l'écran propose « appliquer aux jours
ouverts ».

**Plusieurs commandes dans une journée (Hugo, 2026-11-27).** Un pro qui a
deux créneaux le même jour (7 h – 9 h et 11 h – 12 h, par exemple) a deux
colonnes ce jour-là. Chacune devient sa propre commande, à sa propre
fermeture. Une colonne est donc identifiée par son id, et l'unicité porte sur
le jour **et** le créneau : deux colonnes au même créneau seraient deux
commandes indiscernables.

**À l'écran, un créneau est une rangée** (Hugo, 2026-11-27) : les jours
restent en colonnes, et chaque créneau ajoute une rangée sous la première.
Chaque case (jour × créneau) est un panier, et devient une commande.

```
              │ lun. 1 déc.     │ mar. 2 déc.     │ mer. 3 déc.     │
──────────────┼─────────────────┼─────────────────┼─────────────────┤
 7 h – 9 h    │ 84,20 € HT      │ 0,00 € HT       │ 61,00 € HT      │
              │ Croissant ×40   │                 │ Baguette ×30    │
──────────────┼─────────────────┼─────────────────┼─────────────────┤
 11 h – 12 h  │ 31,50 € HT      │                 │                 │
              │ Baguette ×15    │                 │                 │
──────────────┴─────────────────┴─────────────────┴─────────────────┘
 ＋ un créneau (une rangée de plus)
```

Une rangée vide n'est qu'un emplacement : rien n'est enregistré tant que la
case n'a pas de ligne. La liste d'envies reste une colonne à gauche, sur
toute la hauteur.

Les routes suivent : `POST /planner/columns` (jour + créneau),
`PUT /planner/columns/:id`, `DELETE /planner/columns/:id` (colonne encore en
brouillon et non gelée).

### 3.3 L'agrégat `PlannedDay`

- `PlannedDay.open(buyer, company, site, day, routing)` refuse un jour
  passé et une société absente.
- `replaceLines(lines, now)` et `reroute(routing, now)` ne sont permis
  qu'en `draft` **et avant `converts_at`** : l'agrégat juge avec l'instant
  qu'on lui passe, et refuse au-delà (`PlannedDayFrozenError`, 409). C'est
  ce gel qui ferme la course entre une édition et la conversion
  (objection 1).
  Après la conversion, la colonne se lit et mène à sa commande. Les
  modifications passent par les gestes existants de la commande.
- `markPlaced(orderId)`, `markRefused(cause, reason)` et `markMissed()`,
  écrits par le planificateur **après** le retour du port, dans sa propre
  transaction, comme le récurrent. Une inscription perdue se répare au
  balayage suivant : la passation rend la commande déjà passée (unicité de
  la provenance). Un refus est **définitif** : la colonne est gelée, le
  client ne peut plus la corriger, et le staff qui est sonné peut commander
  à sa place (objection 3).
- Une colonne vide à la fermeture n'est **pas** convertie, et ce n'est pas
  un refus : elle reste `draft` et disparaît de l'écran une fois le jour
  passé. Rien n'est alerté.

La liste d'envies est un CRUD honnête (« ajouter », « retirer ») : aucune
règle ne peut la refuser, sauf le mur de la société.

## 4. Quand une colonne devient une commande

**La fermeture n'est pas un instant unique** : `OrderDeadline` juge par
article, et un article peut fermer plus tôt que les autres (limite propre).
Attendre la fermeture générale ferait refuser toute la colonne dès qu'un
article à limite courte s'y trouve.

**Proposition (Q1)** : la colonne se convertit **à la première fermeture
parmi ses lignes**, un peu avant (marge : 15 minutes). L'écran l'affiche en
pied de colonne (« se commande mar. à 14 h »).

**La première fermeture se demande au commerce.** `OrderDeadline` rend, ligne
par ligne, `limit: Date | null` (`DeadlineBounds.lines`,
`order-cutoffs/domain/deadline/order-deadline-verdict.ts`). Le commerce
lit les `closesAt` de `PlannedBasketCheck` (§ 4 bis) et en prend le minimum, sans dérogation (`waiver: "ignore"`, donc jamais le
délai de grâce). Une ligne à `null` n'oppose rien : si aucune ligne n'a de
limite, la colonne prend l'heure limite générale du jour, et à défaut le
gel tombe la veille du jour servi à 23 h 45 (Q9).

## 4 bis. L'article bloquant se voit AVANT la conversion (Hugo, 2026-11-27)

Une colonne ne doit pas découvrir son refus à la fermeture. Tant qu'elle est
ouverte, chaque ligne qui ferait refuser la passation se montre **en couleur
d'avertissement** (token fold de la famille `warning`), avec son explication
sous la carte, dans les mots du refus réel :

```
┌─ mer. 3 déc. · 61,00 € HT ─────────┐
│ Baguette ×30                        │
│ ⚠ Pain de seigle ×10                │  ← fond et bord warning
│   Commandes fermées pour ce jour    │
│   depuis mar. 10 h. Retirez-le ou   │
│   déplacez-le à un autre jour.      │
│                                     │
│ ⚠ 1 article empêche la commande     │  ← rappel en pied de colonne
└─────────────────────────────────────┘
```

- **La source est le commerce, jamais l'écran.** `PlannedBasketCheck` rend,
  ligne par ligne, `{ sku, closesAt, blocking: { cause, reason } | null }`.
  `blocking` vient des juges de la passation (heure limite sans dérogation,
  limite d'article, article retiré ou plus vendu à cette clientèle, article
  réservé à une autre société), et `reason` est la phrase même que
  `recurringRefusalOf` rendrait. L'avertissement et le refus ne peuvent pas
  diverger : c'est le même calcul.
- **Le devis ne le dit pas** : `ShopQuoteLineView`
  (`packages/contracts/src/shop-quote.ts`) ne porte que quantité et prix
  (vérifié le 2026-11-27). D'où la lecture dédiée, servie avec la colonne
  (`GET /planner`) et rejouée après chaque écriture. Elle se demande par
  lot pour toutes les colonnes affichées : une seule lecture du verdict,
  pas une par colonne.
- **Ce qui bloque change avec le temps** (une heure limite qui passe pendant
  que l'écran est ouvert). L'écran recharge la vérification à l'instant du
  plus proche `closesAt` affiché, sans sondage permanent.
- **Le geste de sortie** est sur la carte : « Retirer » et « Déplacer vers… »,
  avec la liste des jours où l'article passe encore.
- **L'accessibilité** : la couleur n'est jamais le seul signal. Il y a
  l'icône, le texte de l'explication, et une annonce `aria-live` quand une
  ligne devient bloquante.

### Les colonnes interdites pendant un glisser (Hugo, 2026-11-27)

Quand on prend un article qui a une limite (de la liste d'envies, ou d'une
autre colonne), les jours où il ne passerait pas sont **grisés** pendant le
glisser. Ils refusent le dépôt, et un **callout** dit pourquoi dans les mots
du refus :

```
 glisser « Pain de seigle » ▸

┌ lun. 1 déc. ───────┐ ┌ mar. 2 déc. ───────┐ ┌ mer. 3 déc. ───────┐
│░░░░░░░░░░░░░░░░░░░░│ │                    │ │                    │
│░ ⓘ Fermé pour ce  ░│ │   déposer ici      │ │   déposer ici      │
│░ jour depuis       ░│ │                    │ │                    │
│░ sam. 10 h.        ░│ │                    │ │                    │
│░░░░░░░░░░░░░░░░░░░░│ │                    │ │                    │
└────────────────────┘ └────────────────────┘ └────────────────────┘
```

- **La réponse est servie d'avance, jamais calculée à l'écran.**
  `PlannedBasketCheck` répond aussi pour la liste d'envies : pour chaque
  article de la liste, et pour chaque jour affiché, `allowed` ou la cause et
  la phrase. C'est une seule lecture du verdict pour toute la grille
  (articles × jours affichés), servie avec `GET /planner`, puis rejouée
  quand on ajoute un jour ou un article. Prendre une carte ne lance aucun
  appel au serveur.
- **Ce qui grise** : seulement ce qui tient à l'article et au jour, c'est-à-dire
  la limite de l'article (heure, jours ouverts), un article non vendu ce
  jour-là, ou un article réservé à une autre société. Ce qui tient à la quantité
  (un plafond par commande) ne grise pas, puisque la quantité se règle après le
  dépôt : la ligne passe alors en avertissement (§ 4 bis).
- **Le callout** apparaît dans la colonne grisée au survol pendant le
  glisser, et sur la carte elle-même au repos (« ⓘ Pas commandable lun. »),
  pour qu'on le sache avant même de la prendre.
- **Sans souris** : le menu « Ajouter à… / Déplacer vers… » liste les mêmes
  jours. Les jours interdits y sont désactivés, avec la même explication
  lue par le lecteur d'écran. Il n'y a pas de dépôt silencieusement refusé.
- **Le serveur juge quand même.** Un dépôt qui passerait malgré tout (grille
  périmée, heure franchie entre-temps) est enregistré, et la ligne s'affiche
  en avertissement au rechargement. Griser aide à choisir, ça ne remplace pas
  le juge.

- **Après un refus**, la colonne gelée garde la même présentation : la ligne
  fautive reste en avertissement, avec la phrase du refus.

**Le balayage**, sur le cron **des cinq minutes** (`refreshSweeps` dans
`apps/lfd-api/container/worker.ts`). Le cron horaire des récurrents
(`hourlySweeps`) est trop lâche : une heure de retard, c'est une heure
limite manquée.

- `converts_at` est calculé à chaque écriture de la colonne. Il sert au gel
  et à l'affichage.
- Le balayage ne se fie pas à la valeur rangée, parce qu'une limite
  d'article est une décision du catalogue qui peut changer après l'écriture
  (objection 5). Il lit les colonnes `draft` dont le jour servi est **au plus
  tard après-demain**, **ou** dont l'instant rangé est atteint (un article
  qui ferme plusieurs jours avant son jour servi), sur deux index partiels
  (`service_day` et `converts_at`, `WHERE status = 'draft'`). Il redemande
  leur fermeture au commerce par lot, met `converts_at` à jour, et convertit
  celles dont l'instant est atteint. Au plus 200 colonnes par passage.
- **Le coût.** À vide, une lecture indexée toutes les cinq minutes (~8 600
  par mois). Avec des colonnes, une lecture du verdict par passage pour le
  lot, borné par le nombre de colonnes ouvertes des deux prochains jours. Le
  facteur non borné est l'écran (§ 6.1) : un devis par colonne **modifiée**,
  regroupé sur une attente, jamais pour toutes les colonnes à chaque geste.

Une colonne dont la fermeture est passée sans conversion (panne du cron) n'est
pas rattrapée. Elle passe en `missed`, et le client comme le staff le voient.
Jamais de dérogation dépensée par une machine.

## 5. La conversion d'une colonne

Le commerce implémente `PlannedDayPlacement`, sur le modèle exact de
`recurring-occurrence-placement.ts` :

1. **le mur sur l'acheteur** : encore actif et encore membre de la société,
   par la même garde que les récurrents (`OrderGuardReader.roleOf`,
   `isPublicPayer`, `recurring-occurrence-placement.ts`), sinon refus
   `buyer_left` ;
2. **la composition** par `OrderDrafting`, sous `RECURRING_OCCURRENCE_POLICY`
   (`deadlineWaiver: "ignore"`, donc le `lateFee: "apply"` qu'elle porte ne
   s'applique jamais ; le créneau est celui de la colonne),
   avec les lignes, l'acheminement et le créneau figés de la colonne ;
3. **les juges**, ceux que la passation d'une échéance applique déjà :
   heure limite sans dérogation, limites d'article, article encore vendu,
   règlement possible (au compte, comme les récurrents) ;
4. **l'écriture**, côté commerce : la commande, sa provenance
   (`from_planned_day_id`, opaque, unique, cf. Q6) et le fait durable de
   commande passée. L'accusé de commande part déjà de ce fait ;
5. **l'issue**, côté planificateur, après le retour du port : la colonne en
   `placed`, `refused` ou `missed`, et la cloche du staff pour un refus ou un
   manqué. Le commerce n'écrit jamais `recurring.planned_days`
   (`lint:prisma-model-ownership`, objection 2).

## 6. Les écrans (boutique, espace société seulement)

### 6.1 La page « Planificateur »

- **Accès** : une entrée de menu dans l'espace d'une société, cachée aux
  particuliers et derrière la clé **`orderPlanner`** de l'accès aux
  fonctionnalités (« Planificateur de commandes », écran
  `/admin/feature-access`), fermée par défaut et **exemptible** (Q7). On
  l'ouvre d'abord par exemption : une adresse **prouvée** par utilisateur du
  client demandeur ; puis à tous en posant « Ouvert ». Fermée pour
  l'appelant, l'API refuse les routes `/planner` (GET, POST, PUT, DELETE) en
  409 `planner.closed`, APRÈS le mur de la société ; la boutique cache
  l'entrée et `/planificateur` renvoie au rayon. Le balayage
  (`/admin/planner/sweep`) n'est pas gardé : fermer la clé n'arrête pas la
  conversion des cases déjà remplies. La résolution vit au commerce
  (`feature-access`) ; le bloc la demande par le port `PlannerAccess` de
  `recurring/channels/commerce/`, relié dans `appBootstrap/recurring-feed.module.ts`.
- **Ligne 1** : la date de départ, puis le site et son acheminement, repris du
  site choisi.
- **Ligne 2** : la colonne « Liste d'envies », puis une colonne par jour à
  partir de la date de départ, puis « ＋ » qui ajoute le jour suivant.
  L'écran s'ouvre sur un seul jour, comme demandé.
- **« ＋ un créneau »** sous la grille ajoute une rangée, sur un créneau du
  site pas encore pris. La rangée porte son créneau à gauche.
- **En tête de chaque jour** : la date ; **en tête de chaque case** : le total HT du devis, marqué
  indicatif. Les lignes bloquantes sont en avertissement, avec leur
  explication (§ 4 bis). En pied : l'heure de conversion, ou l'état
  (« Commandée », avec un lien vers la commande, « Non passée », « Manquée »).
- **Un jour fermé ou non servi** n'est pas proposé par « ＋ » : on saute au
  jour servi suivant, lu par `list-fulfillment-days.handler.ts`.
- **Le glisser-déposer** : de la liste d'envies vers un jour (copie, quantité
  par défaut : le premier palier de l'article), et d'un jour à l'autre
  (déplacement). La quantité se règle dans la carte avec − et ＋. Je propose
  `@angular/cdk/drag-drop` plutôt qu'un glisser fait main : il gère le
  clavier, le tactile et le défilement horizontal, et une dépendance de plus
  vaut moins qu'un glisser à maintenir. À peser contre le budget de la
  boutique (configuration Cloudflare, 1,30 Mo) : la page se charge à part.
- **Accessibilité (obligatoire)** : le glisser a toujours un équivalent sans
  souris. Chaque carte a un menu « Ajouter à… / Déplacer vers… » qui liste
  les jours, et c'est aussi le geste au téléphone, où des colonnes côte à
  côte ne tiennent pas : sur un écran étroit, les jours s'empilent et on
  passe de l'un à l'autre par onglets.
- **L'écriture** : chaque changement enregistre la colonne entière
  (`PUT /planner/columns/:id`, avec sa `version` ; un 409 après le gel
  recharge la colonne), regroupé sur une courte
  attente pour ne pas écrire à chaque clic. Le devis suit, colonne par
  colonne.

### 6.2 La colonne de gauche : les favoris (Hugo, 2026-11-27)

**La liste d'envies, ce sont les favoris.** Ils sont en production depuis le
2026-11-27 ([`les-favoris.md`](../boutique/les-favoris.md)) : un cœur sur
chaque article, l'onglet « Favoris » du menu des rayons, gardés **par
espace** (`public.shop_favorite`). Comme un site est son propre espace, les
favoris d'un site sont ceux de son planificateur. Il n'y a donc pas de
second objet, ni de mode « liste d'envies » de la boutique :

- la colonne de gauche du planificateur montre les **favoris de l'espace** ;
- son bouton « Ajouter des articles » ouvre la boutique sur l'onglet
  « Favoris » (`FAVORITES_SHELF`), où le cœur fait déjà ce qu'il faut ;
- un favori retiré disparaît de la colonne, sans toucher aux jours déjà
  remplis.

**Le chemin.** Le bloc des paniers ne lit pas `shop_favorite` (propriété du
commerce). Il déclare dans `recurring/channels/commerce/` une lecture
`PlannerFavoriteSkus` (« les favoris de cette société »), que le commerce
implémente avec le store des favoris. `GET /planner` la compose avec
`PlannedBasketCheck` pour griser les jours (§ 4 bis).

Cela remplace Q3 (« une liste par personne ») : les favoris sont partagés
par tous les membres de l'espace, ce qui est le comportement déjà en
production.

**Ce que L1 avait bâti et qui disparaît** : la table
`recurring.wishlist_items`, ses routes `PUT/DELETE /planner/wishlist/:sku`,
ses handlers et ses contrats. Comme la migration de L1 est déjà appliquée à
la base de dev, la table est retirée par une **nouvelle** migration
(`DROP TABLE`, jamais déployée, vide). Le `migration.sql` de L1 reste tel
quel.

### 6.2 bis Le prévisionnel du fournil (Hugo, 2026-11-27)

**Une colonne n'est jamais commandée avant sa propre fermeture.** Le client
garde la main jusque-là, et peut changer ses quantités la veille. Le jour du
surlendemain reste donc un brouillon tant que ses commandes ne ferment pas.

En revanche, le Prod manager voit ces brouillons dans le **prévisionnel**
(`/prod-manager/previsionnel`, [`le-previsionnel.md`](../../fournil/le-previsionnel.md)),
pour se faire une idée :

```
                  lun. 1   mar. 2   mer. 3
Croissant          320      280      300
  dont planifié    +40      +40       —     ← en italique, couleur atténuée
Baguette           210      190      205
  dont planifié      —      +30      +30
──────────────────────────────────────────
Total              980      910      940
Planifié, non commandé : +70 · +70 · +30 pièces
```

- **Une couche à part, jamais mélangée.** Les quantités planifiées
  s'affichent à côté de la demande du commerce, marquées « planifié, non
  commandé ». Elles n'entrent ni dans `totalUnits`, ni dans l'arrêt du plan,
  ni dans le dossier du jour, ni dans les tranches. Elles ne deviennent de la
  production qu'en devenant des commandes.
- **Colonnes ouvertes seulement.** Une journée arrêtée montre un compte figé :
  la couche n'y apparaît pas. Une colonne convertie n'est plus un brouillon,
  et sa commande est déjà dans la demande.
- **Le chemin.** La production lit le commerce par
  `ExpectedProductionReader` (`production/channels/commerce/`). Le commerce
  lit les brouillons par une lecture que le bloc des paniers DÉCLARE et
  IMPLÉMENTE lui-même dans `recurring/channels/commerce/`
  (`PlannedQuantitiesReader` : par jour et par SKU, les quantités des
  colonnes `draft`, en une requête agrégée sur la fenêtre). C'est la figure
  d'`OrderHandoverHistoryReader`. Ni la production ni le commerce ne lisent
  `recurring.planned_days`.
- **Le contrat** du prévisionnel (`packages/contracts/src/production-forecast.ts`)
  gagne `plannedQuantities` par ligne (même longueur que `days`) et
  `plannedUnits` par jour. Ces champs sont additifs : l'écran les ignore tant
  qu'il n'est pas mis à jour.
- **Aucun montant**, comme le reste du prévisionnel.

### 6.3 Le back-office

Lot facultatif (L5) : sur la fiche client, les jours planifiés à venir en
lecture seule, et les refus mis en évidence, comme les paniers récurrents.

## 7. Les lots

| Lot                                | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Migration |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| ~~**L1**~~ ✅ 2026-11-27           | Bâti sous le nom `PlannedColumn` (table `recurring.planned_columns`, une ligne par jour × créneau ; le site est la société de l'espace, pas de `site_key`). Les tables dans le schéma `recurring`, `PlannedBasketCheck` servi avec les colonnes, l'agrégat `PlannedDay`, la liste d'envies, les routes `GET /planner?from&site`, `PUT /planner/days/:day`, `PUT`/`DELETE /planner/wishlist/:sku` (pros seulement, mur `company_id`, `@Idempotent`) ; tests aux trois niveaux, dont le mur entre deux sociétés                                  | additive  |
| ~~**L2**~~ ✅ 2026-11-27           | Bâti : port frère `PlannedColumnPlacement` sur une passation commune sans personne devant l'écran (`UnattendedOrderPlacement`, partagée avec les récurrents), provenance `orders.from_planned_column_id`. `converts_at` et le gel, la provenance `planned_day` dans le port de passation existant, la provenance sur la commande, le balayage des cinq minutes sur les deux prochains jours, la cloche du staff ; e2e : convertie, double balayage, édition refusée après le gel, article fermé plus tôt, acheteur parti, sans crédit, manquée | additive  |
| ~~**L3**~~ ✅ 2026-11-27           | Bâti derrière un drapeau de produit, remplacé le 2026-11-27 par la clé `orderPlanner` (§ 6.1), glisser natif HTML5 sans `@angular/cdk`, gestes au clavier par menus. La page du planificateur : date de départ, ligne du site, colonnes, « ＋ », totaux par devis, lignes bloquantes en avertissement avec leur explication et leurs gestes de sortie, colonnes grisées et callout pendant un glisser, états, glisser-déposer et son équivalent clavier, affichage au téléphone                                                                | —         |
| ~~**L4**~~ ✅ 2026-11-27 (serveur) | Bâti ; reste le bouton vers l'onglet « Favoris », livré avec L3. Les favoris à la place de la liste d'envies (§ 6.2) : `PlannerFavoriteSkus` fait par le commerce, la liste d'envies de L1 retirée (nouvelle migration `DROP TABLE`, routes, handlers, contrats), le bouton qui ouvre la boutique sur l'onglet « Favoris »                                                                                                                                                                                                                     | —         |
| **L4 bis**                         | Le prévisionnel : `PlannedQuantitiesReader` (déclaré et fait par le bloc), le commerce le joint à `ExpectedProductionReader`, le contrat gagne `plannedQuantities` / `plannedUnits`, l'écran les montre à part (§ 6.2 bis) ; test : un brouillon n'entre jamais dans `totalUnits` ni dans l'arrêt                                                                                                                                                                                                                                              | —         |
| **L5**                             | (facultatif) la lecture au back-office                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —         |

L1 et L2 d'abord, parce que l'écran sans conversion serait un tableau qui
promet une commande qu'il ne passe pas.

## 8. Les décisions (prises par Hugo le 2026-11-27 : les propositions)

| #      | Question                                                                                                            | Proposition                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Q1     | Quand une colonne se convertit-elle, sachant que des articles ferment plus tôt que d'autres ?                       | à la **première** fermeture parmi ses lignes, 15 min avant ; affichée sur la colonne                                            |
| Q2     | Un article ne passe plus à la conversion : on refuse tout le jour, ou on commande le reste ?                        | tout le jour refusé, définitivement (la colonne est gelée) ; le client le voit, le staff est sonné et peut commander à sa place |
| ~~Q3~~ | La liste d'envies : une par personne, ou partagée par toute la société ?                                            | une par personne et par société, comme le panier                                                                                |
| Q4     | « Le site choisi » : un planificateur par site d'une société (carte des sites), ou un acheminement libre par jour ? | un planificateur par site, et l'acheminement du site par défaut                                                                 |
| Q5     | Combien de jours à l'avance au plus ?                                                                               | 28 jours                                                                                                                        |
| Q6     | Le client voit-il « vient du planificateur » sur sa commande, et le staff dans la liste ?                           | oui, une provenance comme pour les récurrents                                                                                   |
| Q7     | Ouvert à tous les pros d'un coup, ou d'abord au client demandeur (drapeau par société) ?                            | d'abord le client demandeur — par la clé `orderPlanner` et ses exemptions par adresse (§ 6.1, Hugo, 2026-11-27)                 |
| Q9     | Une colonne dont aucun article n'a d'heure limite : quand se convertit-elle ?                                       | à l'heure limite générale du jour, sinon la veille à 23 h 45                                                                    |
| Q10    | Le planificateur vit dans le bloc `recurring/` (pas de doublon), au prix d'un nom qui ne dit plus tout : d'accord ? | oui ; renommer le bloc le jour d'un troisième usage                                                                             |
| Q8     | Le client est-il averti par e-mail d'un jour refusé ou manqué ?                                                     | non dans le premier bâti : la colonne le dit, et le staff appelle (comme les récurrents)                                        |

## 9. La contradiction (`vitruve`, 2026-11-27)

| Objection                                                                  | Sort                                                                                          |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| B1 — une édition pendant la conversion se perd                             | intégrée : gel par l'agrégat à `converts_at` (§ 1 règle 6, § 3.3)                             |
| B2 — le commerce écrirait la table du planificateur                        | intégrée : l'issue s'inscrit après le retour du port, comme le récurrent (§ 5)                |
| B3 — un refus `refused` ne se rejouait jamais                              | intégrée : un refus est définitif, le staff reprend la main (§ 3.3, Q2)                       |
| S4 — « quand ferme ? » demande un port non déclaré ; `limit: null`         | intégrée : `PlannedBasketCheck` (§ 4 bis), minimum des `limit`, sans grâce (§ 4) ; Q9         |
| S5 — le filet horaire laisse passer une limite avancée                     | intégrée : le balayage redemande la fermeture des deux prochains jours à chaque passage (§ 4) |
| S6 — coûts non chiffrés hors du cas vide                                   | intégrée : lecture par lot ; un devis par colonne modifiée (§ 4, § 6.1)                       |
| S7 — un nouveau bloc duplique le récurrent                                 | intégrée : contexte de `recurring/` (§ 3.1), Q10                                              |
| S8 — rien ne convertit aujourd'hui à un instant                            | assumée : L2 est le gros lot, le calcul de fermeture est neuf                                 |
| Mineurs (`readCompanyStanding`, `occurrenceVerdict` inexistant, `lateFee`) | corrigés dans le texte (§ 5)                                                                  |

Non vérifié par `vitruve`, à éprouver au bâti : le mur tenant des routes de
L1 (e2e entre deux sociétés), et le poids de la page dans le budget de la
boutique.

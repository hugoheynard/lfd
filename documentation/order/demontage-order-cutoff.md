# Démonter `OrderCutoff` — lot 9 du dossier heure limite

> **État : plan.** Écrit le 2026-09-04. Lot 9 de
> [`architecture-heure-limite-de-commande.md`](architecture-heure-limite-de-commande.md).
>
> ✅ **L'arbitrage est tranché** (Hugo, 2026-09-04) : **l'échelle est le bon
> système.** Les dimensions que `OrderCutoff` avait en propre — le point de
> retrait, le jour de semaine — ne sont pas reportées. On les perd, et c'est le
> résultat voulu du dossier, pas un dommage collatéral (§2).

## 1. Pourquoi ce lot ne se fait pas d'un trait

Le retrait de `OrderCutoff` n'est pas la suppression d'un code mort. C'est,
aujourd'hui encore, **la seule règle qui refuse une commande en retard** pour
tout article dont le référentiel ne dit rien.

`ensureWithinOrderCutoff` (`src/b2b/orders/domain/services/order-cutoff-guard.ts`)
tranche ligne par ligne :

- l'article porte une limite venue du fil → elle décide **seule** ;
- l'article n'en porte pas → il retombe sur `OrderCutoff` ;
- **rien nulle part → tout passe.** C'est le défaut voulu, écrit dans la
  fonction : une plateforme qui n'a rien réglé ne refuse pas au nom d'une limite
  que personne n'a posée.

Retirer le repli sans que l'échelle ne dise quelque chose ne durcit rien : ça
**ouvre**. Silencieusement, et sur la porte du client comme sur celle du
comptoir.

### Les deux préconditions, et pourquoi elles ne se voient pas d'ici

1. **Une règle globale existe dans l'échelle** (`/pim/limites-de-commande`).
   Sans elle, `resolveLimitsByVariant` rend `null` pour chaque déclinaison, et
   le fil ne porte aucune limite.
2. **Une livraison portant ces limites a été ingérée ET validée.** Les colonnes
   `CatalogItem.orderLimit*` ne se remplissent qu'à l'ingestion, et une arrivée
   attend un humain dans la boîte de réception. Régler l'échelle ne suffit
   donc pas : il faut que l'arrivée soit passée.

⚠️ **Précondition 1 est plus étroite qu'écrit** : `resolveOrderTimeLimit` rend
`null` si `daysBefore` **ou** `time` manque, et l'échelle autorise une règle qui
ne pose que l'une des deux. « Une règle globale existe » ne suffit donc pas —
elle doit poser **le délai ET l'heure**.

### 🔴 Ce ne sont pas des seuils, ce sont des états réversibles — et rien ne les tient

Le plan les traitait comme des cases à cocher avant le merge. Elles se défont à
tout instant **après** :

- `resolveLimitsByVariant` rend une carte **vide** dès `rules.length === 0` ;
- `prisma-catalog-item.repository.ts` réécrit `orderLimit*` à `null` à **chaque**
  upsert — volontairement, et c'est écrit au-dessus ;
- `DELETE /pim/order-time-limits/:id` existe et n'a **aucune garde côté
  commerce**.

Donc, après le déploiement A : un staff du référentiel supprime le rang global,
une livraison passe, et **plus rien ne refuse une commande en retard sur toute la
plateforme**. Sans écran, sans porte, sans test qui le dise. Aujourd'hui
`OrderCutoff` couvre ce trou.

✅ **Le verrou existe depuis le 2026-09-04.**
`RemoveOrderTimeLimitHandler` refuse de retirer le rang **global** dès qu'une
autre règle ne pose pas à elle seule le délai **et** l'heure —
`GlobalOrderTimeLimitStillNeededError`, 409, et le message **nomme** les règles
en cause. Un refus, pas une consigne de runbook.

⚠️ Ce que le verrou ne couvre pas, et qui reste voulu : retirer un rang global
**seul de son espèce** passe. Il n'y a alors rien à rendre muet, et « je
n'oppose plus de limite » est un état légitime, écrit dans la garde. Ce qu'on
ferme, c'est de le faire sans le voir.

Reste donc, avant le déploiement A, la précondition qui ne se code pas : que le
rang global **existe** et qu'une livraison le portant soit passée. Le verrou
empêche de le retirer par mégarde ; il n'oblige personne à le poser.

## 2. ✅ Ce qu'on perd, et pourquoi on l'accepte

`OrderCutoff` et l'échelle ne décrivent **pas les mêmes dimensions**.

|               | Dimensions                         | Rangs                                  |
| ------------- | ---------------------------------- | -------------------------------------- |
| `OrderCutoff` | point de retrait × jour de semaine | point+jour, point, défaut+jour, défaut |
| L'échelle     | le catalogue                       | global, famille, produit, déclinaison  |

La conversion n'est possible que dans **un** cas : une règle par défaut de la
plateforme (`pickup_address_id IS NULL AND weekday IS NULL`) se reporte
exactement sur le rang **global** — mêmes champs, `daysBefore` + `time`.

Tout le reste — une règle par **jour de semaine**, une règle par **point de
retrait** — n'a aucun équivalent, et n'en aura pas. **Tranché : on ne reporte
pas.** Donner à l'échelle une dimension calendaire ou une dimension « point »
referait la faute que ce dossier corrige : la limite est une contrainte de
**production**, pas d'acheminement. Une règle par point de retrait n'a jamais
décrit ce qu'elle prétendait décrire.

Ce que ça implique concrètement, et qui doit être vu avant le merge :

```sql
-- Ce qui va disparaître, et qui n'a pas d'équivalent dans l'échelle.
SELECT pickup_address_id, weekday, days_before, "time", grace_minutes
FROM public.order_cutoffs
WHERE pickup_address_id IS NOT NULL OR weekday IS NOT NULL;
```

⚠️ `grace_minutes` était absente de cette requête, et de la phrase qui suit. Une
règle par défaut à 45 minutes reportée sans sa grâce transforme un état `grace`
— refusé mais **rattrapable par dérogation, et surtaxé** — en `closed`, refus
sec. Le §5 dit ne pas toucher à la surtaxe ; ce champ oublié y touchait.

Ces lignes-là ne se convertissent pas : ce qu'elles disaient se redit, s'il faut
le redire, en posant une limite sur la **famille** ou la **fiche** concernée.
C'est de la saisie, dans l'écran du référentiel, avant le déploiement A.

La règle par défaut de la plateforme (`NULL, NULL`) — **au plus une**, l'index
partiel `order_cutoffs_default_all_days` le garantit — se reporte sur le rang
**global** : `daysBefore`, `time` **et `graceMinutes`**, les trois. Elle se
ressaisit à la main — une ligne, dans un écran fait pour ça — plutôt que par une migration
qui écrirait de la donnée métier hors du bus et hors du journal.

## 3. 🔴 Le déploiement A ne peut pas partir avec les lots 0 à 7

Les lots 0 à 7 sont sur `dev` et n'ont jamais été poussés : ils partiront **en
un seul merge**. Y ajouter le déploiement A produirait exactement l'état qu'on
cherche à éviter.

| Au merge des lots 0–7 | limite d'article                         | repli         | résultat                                               |
| --------------------- | ---------------------------------------- | ------------- | ------------------------------------------------------ |
| sans A                | `null` (aucune livraison encore ingérée) | `OrderCutoff` | **inchangé** — ce qui refuse aujourd'hui refuse encore |
| avec A                | `null`                                   | plus de repli | **tout passe**                                         |

L'échelle est nécessairement vide à l'instant où son écran apparaît, et le fil
ne porte les limites qu'après une livraison ingérée **et validée**. A doit donc
vivre sur sa propre branche et attendre que les deux préconditions du §1 soient
vraies en production.

## 4. Les trois déploiements

Chacun est un merge vers `main`, dans cet ordre. Aucun ne se combine avec le
suivant : c'est la seule façon qu'un retour arrière reste un `revert`.

### Déploiement A — le repli n'est plus lu

Le code cesse de consulter `OrderCutoff`. La table, l'écran et les routes
restent : rien n'est perdu, tout est réversible par un `revert`.

- `ensureWithinOrderCutoff` perd `fallback` et `pickupAddressId` ; un article
  sans limite devient `open` ;
- `OrderDrafting.ensureNotTooLate` cesse d'appeler `this.cutoffs.list()` ;
- le port `OrderCutoffReader` et son binding (`orders.module.ts:112`)
  disparaissent. ⚠️ Ce n'est **pas** le seul lien `orders` → `order-cutoffs` :
  `orders.module.ts` importe aussi `OrderCutoffRepository` (l.5) et
  `OrderCutoffsModule` (l.6, l.70) ;
- les doubles de `OrderCutoffReader` dans `place-order.handler.spec.ts:231` et
  `place-order-for-customer.handler.spec.ts:286` tombent avec le port ;
- le commentaire de `order-drafting.service.ts:151-154` — « la règle qui
  s'applique est celle du point EFFECTIVEMENT retenu » — devient **faux** dès
  que la garde perd `pickupAddressId` ;
- `decideOrderCutoff` et `resolveOrderCutoff` (contrats) deviennent morts pour
  la garde. **Ils restent** : `OrderCutoffView` sert encore à l'écran.

🔴 **Les tests se REPORTENT, ils ne s'inversent pas — et c'est le gros du lot.**
`test/order-cutoffs.e2e-spec.ts` appelle **13 fois** `seedCutoffPassedBy`, qui
sème une règle **du commerce** pour fabriquer l'état « en retard ». Ces treize
situations portent les sections rattrapage, **dérogation** et **surtaxe** —
c'est-à-dire les lots 6 et 7, que le §5 déclare hors périmètre. Les inverser
écrirait qu'une commande en retard passe, donc supprimerait la seule preuve e2e
de la dérogation et de la surtaxe. Elles basculent sur `seedArticleLimit`.

Idem pour les surfaces d'accès : **trois tests** (et pas deux entrées de table)
se servent de `/admin/order-cutoffs` comme cas concret d'un `PATCH` sur
`b2b_settings` — `staff-access.e2e-spec.ts:87-89`, `staff-roles.e2e-spec.ts:127`
et `:138`. Les retirer supprimerait la preuve « lit sans pouvoir écrire » de la
matrice de rôles : ils se reportent sur une autre route `b2b_settings`.

### Déploiement B — l'écran et les routes

- back-office : `reglages/retraits-livraisons/cutoffs-section/` et
  `order-cutoffs.service.ts` ;
- backend : `src/b2b/order-cutoffs/` en entier — contrôleur
  (`@Controller("admin/order-cutoffs")`), handlers, repository, module, et son
  entrée dans `app.module.ts` ;
- contrats : 🔴 **`order-cutoff.ts` ne se supprime pas.** Le fichier porte, sous
  le nom de l'ancien mécanisme, le cœur du **nouveau** : `OrderLimitSpec`,
  `OrderCutoffDecision`, `decideOrderLimit`, `orderLimitInstant`,
  `weekdayOfDate` — tous lus par `order-cutoff-guard.ts` et
  `product-catalog.reader.ts`. Il faut le **découper** (ce qui reste, où, sous
  quel nom), et ce découpage n'est ni décidé ni chiffré ici. Seuls
  `OrderCutoffView`, `OrderCutoffPayload` et `decideOrderCutoff` partent ;
- les surfaces d'accès : `staff-access.e2e-spec.ts` et `staff-roles.e2e-spec.ts`
  listent `/admin/order-cutoffs` comme surface `b2b_settings` — deux entrées à
  retirer, pas à commenter.

🔴 **Ce qui NE part PAS** : les trois cas `order_cutoff.created / updated /
removed` de `journal-line.ts`. Le journal est **append-only** : les faits déjà
écrits restent, et un fait sans cas retombe sur `?? event.type` — la ligne
afficherait `order_cutoff.created` en clair, à un endroit qu'on relit quand un
client réclame. Elles se marquent « fait d'un mécanisme retiré », elles ne se
suppriment pas.

⚠️ Le plan écrivait que `journal-line.ts` rend `null` pour un fait inconnu.
C'est `settingSentence` qui rend `null` ; son appelant, lui, replie sur
`event.type`. La conclusion tenait, la raison était fausse.

**Même piège, ailleurs, et non inventorié** : `activity-module.ts:27` range les
faits par préfixe et porte `"order_cutoff."`. Le retirer rendrait les entrées
historiques orphelines — `"order_cutoff.created".startsWith("order.")` est faux,
donc `"order."` ne les rattrape pas.

De même, `ORDER_CUTOFF_FACTS` côté serveur ne se supprime que si plus aucun
lecteur n'en a besoin ; le journal en base, lui, garde ses lignes quoi qu'il
arrive.

### Déploiement C — la table

`DROP TABLE public.order_cutoffs`, **et `model OrderCutoff` retiré de
`schema.prisma` dans le même passage** — sinon le schéma reste désaligné et la
prochaine `migrate dev` proposera de recréer la table.

Irréversible, donc en dernier et seul. Ce qui rend la perte acceptable n'est pas
le délai, c'est que le **journal porte déjà les cinq champs** de chaque règle
(`order-cutoff.events.ts`) : ce qui a été posé, quand, par qui, reste lisible
après le `DROP`.

## 5. Ce que ce lot ne fait pas

Il ne touche **pas** aux dérogations (`order_cutoff_waiver`) ni à la surtaxe.
Elles portent « order_cutoff » dans leur nom parce qu'elles sont nées avec la
règle du commerce, mais elles s'appliquent à la limite **du référentiel** depuis
le lot 6. Les renommer serait une migration de valeurs, pas un démontage — un
sujet à part, s'il se pose.

# Plan — les créneaux du retrait public

> **Statut : 📐 plan, 2026-09-16. Rien n'est bâti.**
>
> **Contredit par `vitruve` le 2026-09-16**, qui a rendu **4 BLOQUANT et 10
> SÉRIEUX** sur la première version. Le sort de chacun est au §8. Trois des
> quatre bloquants ont disparu avec la découpe tranchée par Hugo (§3) ; les
> autres sont corrigés ou assumés, et dits.
>
> ⚠️ **La première version portait une migration de données** (`opening` → une
> table de règles). **Elle n'en porte plus.** Ce plan est **purement additif** :
> rien n'est converti, rien n'est supprimé, le retrait pro n'est pas touché.
>
> Lu avant, et cité : [`plan-remise-et-livraison-par-clientele.md`](../b2b/plan-remise-et-livraison-par-clientele.md)
> (le voisin immédiat, sur le même écran),
> [`architecture-prise-de-rendez-vous.md`](../b2b/architecture-prise-de-rendez-vous.md)
> §2.1 (le précédent « règle, pas liste »),
> [`../order/architecture-heure-limite-de-commande.md`](architecture-heure-limite-de-commande.md)
> et [`../order/demontage-order-cutoff.md`](demontage-order-cutoff.md)
> (la dimension « point × jour », et pourquoi elle a été abandonnée),
> et le dossier de handoff `handoff-bienvenue/` — **hors dépôt**, lu le
> 2026-09-16 : l'écran public qui consommera ceci.

## 0. La demande, et pour qui

Hugo, le 2026-09-16 :

> « côté admin pour les créneaux, à la place de heures de retrait, on fait un
> générateur de créneau avec une durée, on peut les ouvrir pro perso, je pense
> qu'il faut qu'on puisse ajouter un badge à un créneau »

> « j'ai besoin que tu spécifie qu'on est en train de travailler sur du créneau
> retrait public »

> « plutôt que de casser ce qu'on a fait pour le créneau pro faisons un
> public-pickup-hours […] et on mutualisera plus tard »

### 🔴 Le sujet est le créneau que choisit un VISITEUR

Ce chantier ne naît pas du back-office : il naît de l'**ouverture au public**.
L'accueil public en préparation pose deux questions à un visiteur non
enregistré — quelle maison, quelle heure — et la seconde **est** ce créneau.
C'est lui qu'on règle ; l'écran d'administration n'est que l'endroit où il se
saisit.

Quatre besoins n'appartiennent qu'à lui, et **aucun n'est satisfait
aujourd'hui** :

| Le public a besoin de                                                               | Le pro, non                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| un **badge** — un visiteur ignore ce qui sort du four à 7 h 15                      | il connaît les fournées, il commande la veille   |
| une **capacité de service** — c'est le volume public qui sature un comptoir (D3)    | quelques commandes, préparées à part             |
| choisir **sans compte** — elle se compte donc sur des commandes sans société        | il a un compte, une société, un historique       |
| que le créneau se **vende** — « les créneaux suivent les fournées » est un argument | on ne lui vend pas une heure, on la lui confirme |

---

## 1. L'existant, ouvert et vérifié le 2026-09-16

> Ce tableau portait **quatre erreurs** dans la première version, toutes
> relevées par `vitruve` et corrigées ici. Elles sont listées au §8 pour que
> personne ne les réintroduise.

| Fait                                                                                                                                                                                                                                                                                                                                              | Où                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Un point porte **deux fenêtres nommées** (`proPickup`, `publicOpening`) en **JSON**, colonne `opening`                                                                                                                                                                                                                                            | `prisma/schema/public/settings.prisma`                                            |
| Aucun créneau n'existe : `pickupSlots()` découpe ces fenêtres en **heures pleines** (`HOUR = 60`) à la lecture                                                                                                                                                                                                                                    | `packages/contracts/src/pickup.ts:167,173`                                        |
| `PickupAccess` se **déduit** — pro = couvert par le créneau réservé et lui seul                                                                                                                                                                                                                                                                   | idem                                                                              |
| **Deux** importateurs de `pickupSlots` : le dialogue de retrait et la saisie de commande staff. ⚠️ **PLUS QU'UN depuis le 2026-09-21** — le dialogue de retrait est parti avec l'écran `/nouvelle-commande` de la boutique ; il n'en reste que la saisie staff                                                                                    | `acheminement-commande.ts:5`                                                      |
| Plus **un lecteur serveur** : `windowFitsPickup` valide qu'une heure convenue tient dans l'une des fenêtres                                                                                                                                                                                                                                       | `b2b/orders/domain/services/agreed-fulfillment.ts:103`                            |
| 🔴 Ce lecteur **n'oppose rien** quand la liste est vide : un point sans heures accepte n'importe quelle heure                                                                                                                                                                                                                                     | idem, l. 110-111                                                                  |
| L'étape d'heure de la boutique n'importait que le **type** ; sa liste de créneaux de livraison était **écrite en dur**, sans source. ⚠️ **Les deux ont DISPARU le 2026-09-21** avec l'écran du mode de service — les noms ne sont plus cités en chemin, ils ne mènent nulle part. La liste inventée ne peut donc plus servir de source à personne | — (supprimés)                                                                     |
| **Aucune capacité, nulle part.** « elle répond _trop tard_, **jamais _complet_** »                                                                                                                                                                                                                                                                | schéma entier ; `architecture-heure-limite-de-commande.md`                        |
| Une commande fige son acheminement en **JSON** : `pickupAddress` (snapshot postal, **sans identifiant**) et `fulfillment` (fenêtre + provenance)                                                                                                                                                                                                  | `public/orders.prisma:144,162`                                                    |
| `requestedDeliveryDate` est indexée mais **nullable en base**                                                                                                                                                                                                                                                                                     | `public/orders.prisma:128,273`                                                    |
| 🔴 Sur le **parcours client**, la tranche horaire est **facultative** : `hasWindowWhenPickedUp` n'existe que sur la saisie staff, et son JSDoc le dit                                                                                                                                                                                             | `packages/contracts/src/order.ts:369-370`, `admin-order.ts:75-78`                 |
| 🔴 En retrait, le défaut de fenêtre est **nul** — donc `agreeFulfillment` fige `window.value = null`, `source: "default"`                                                                                                                                                                                                                         | `order-drafting.service.ts:313-319`, `delivery-defaults.reader.ts:19-23`          |
| **Un seul** chemin d'écriture de commande. Aucun chemin abonnement, aucun code d'avenant                                                                                                                                                                                                                                                          | `prisma-order.repository.ts:37`, via `OrderDrafting.draft`                        |
| `GET /pickup-addresses` est `@Public()` et anonyme : c'est le **front** qui calcule la clientèle                                                                                                                                                                                                                                                  | `pickup-addresses.controller.ts:16-18`, `client-audience.service.ts:45`           |
| `pickupAddressPayloadSchema.opening` porte un `.default({null, null})` : un `PATCH` qui l'omet **efface les fenêtres**                                                                                                                                                                                                                            | `packages/contracts/src/pickup.ts:88`                                             |
| Le classement du journal a **deux** endroits : serveur et front                                                                                                                                                                                                                                                                                   | `growth/domain/activity-module.ts:27-33`, `admin/journal/journal-line.ts:205-211` |
| `HoursForm` a un **second** consommateur hors du panneau du point                                                                                                                                                                                                                                                                                 | `packages/b2b-ui/src/company/delivery-specs/delivery-specs.ts:11,40`              |

### 🔴 Deux phrases du dépôt étaient périmées — corrigées le 2026-09-16

`plan-remise-et-livraison-par-clientele.md` annonçait que ses lots **B** et
**C** n'étaient pas bâtis. **Les deux le sont** : les trois pages de
`/b2b/reglages/` existent (`04e0d15a` puis cinq commits d'affinage), et
`pickupOffer` lit `pickupDiscountFor`. Corrigé dans le même commit que ce plan
(CLAUDE.md §8).

---

## 2. Ce que le dépôt a tranché, et où l'on s'en écarte

### 2.1 « Règle, pas liste » — on suit

`architecture-prise-de-rendez-vous.md` §2.1 compare les deux modèles et choisit
les règles : deux petites tables stables, une fonction pure, et **aucun créneau
persisté qui puisse diverger de l'horaire réel**. `OrderCutoff` tranche pareil.
Ce plan s'y range.

### 2.2 ⚠️ Mais l'argument qu'on lui empruntait était faux

La première version affirmait que `slotsFor` « traite déjà la consommation par
son argument `taken` ». **C'est faux, et il faut l'écrire pour que personne ne
s'y appuie** : `collectDaySlots` écarte un créneau dès qu'il chevauche
(`availability.ts:113-115`) — c'est une **exclusivité à 1**, pas un compte à N.
Et même ce 1 est tenu par un index SQL, pas par la fonction pure. La propriété
dont ce plan a besoin est précisément celle que le précédent n'a pas. Elle est
donc à construire, pas à hériter (D6).

### 2.3 La dimension « point × jour » — pourquoi ce n'est pas la même

`demontage-order-cutoff.md` acte l'abandon de « point de retrait × jour de
semaine », au motif que « la limite est une contrainte de **production**, pas
d'acheminement ». Une heure limite dit quand la pâte doit être engagée ; les
heures d'un comptoir disent quand **ce comptoir-là** reçoit. Aucune échelle
produit ne peut porter les secondes. Homonymes, pas identiques.

### 2.4 🔴 Le badge : `vitruve` objecte, Hugo tranche contre — et c'est assumé

`vitruve` (S1) : le badge « suit la fournée », donc c'est un **fait de
production**, aujourd'hui porté par `ovenHoursOf(shelfId)` — clé **rayon** — et
le SPEC dit « en attendant que le référentiel le porte ». Le ranger par point ×
jour serait reconstruire la dimension abandonnée pour le seul champ qui ne lui
appartient pas. **L'objection est juste sur ses prémisses.**

**Hugo tranche : saisie par créneau, texte libre** (2026-09-16), et la raison
renverse la prémisse — **le badge n'est pas une vérité de production, c'est un
argument commercial**. « Le créneau le plus demandé » ou « tout est chaud » ne
se déduit d'aucune heure d'enfournement : c'est ce que le vendeur veut dire à
cette heure-là, dans cette maison-là. Un argument de vente appartient au point
de vente.

Ce que ça coûte, et qui est accepté : un badge peut **mentir** le jour où le
four tombe en panne. C'est un défaut d'exploitation, pas d'intégrité — à la
différence d'une capacité fausse, qui coûte une commande (D5). Les fermetures
datées (D4) couvrent le cas grave : un jour sans fournée se **ferme**, il ne se
re-badge pas.

---

## 3. 🔴 La découpe : le public à côté, le pro intact

Décision de Hugo, 2026-09-16, et **c'est elle qui rend ce plan sûr**.

La première version remplaçait `opening` par une table de règles. `vitruve` (B1)
a montré ce que ça produisait au dernier merge : la colonne supprimée sans
qu'aucune étape n'ait converti quoi que ce soit, et **deux pannes opposées à la
fois** — la boutique affiche « aucune heure déclarée » (un état que le code
documente comme normal, donc rien ne rougit) pendant que le serveur **cesse de
refuser**, un point sans fenêtre n'opposant rien. Comptoir ouvert à toute heure,
sur un réglage dont la seule copie venait d'être détruite.

**On ne convertit donc rien.** Les créneaux publics sont une **structure neuve,
à côté** :

```
PickupAddress
├── opening : Json          ← LE PRO. Ne bouge pas. Deux fenêtres, comme aujourd'hui.
└── créneaux publics        ← NEUF. Règles + fermetures. Ne concerne que le public.
```

|                 | Retrait **pro**            | Retrait **public**    |
| --------------- | -------------------------- | --------------------- |
| Source          | `opening` (inchangé)       | les règles neuves     |
| Créneaux        | déduits, heures pleines    | déduits, pas réglable |
| Badge, capacité | non                        | oui                   |
| Qui lit         | pro connecté, saisie staff | visiteur et perso     |

**Conséquences immédiates :**

- les colonnes `open_to_b2b` / `open_to_b2c` de la première version
  **disparaissent** — une règle publique est publique par construction ;
- `vitruve` S7 (« le serveur ne connaît pas la clientèle sur une route
  publique ») **tombe** : il n'y a plus de clientèle à décider, la surface
  publique sert les créneaux publics ;
- la mutualisation pro/public est **remise à plus tard**, explicitement.

⚠️ **Le piège de nommage, et il faut le tenir.** `PickupOpening` porte **déjà**
un champ `publicOpening` : l'**amplitude d'ouverture** du comptoir au public.
Ce n'est pas la même chose que les créneaux réservables. La structure neuve
s'appelle donc **créneaux** (`PublicPickupSlotRule`), **jamais « heures »** —
et l'existant garde « heures », sans renommage.

---

## 4. Décisions

**D1 — Les créneaux restent dérivés.** Une règle, pas une liste (§2.1). Changer
un horaire reste un `UPDATE` sur une ligne, et rien d'enregistré ne peut
diverger de l'horaire réel.

**D2 — Une règle = une plage homogène d'un point.** Table
`public_pickup_slot_rules`, schéma `public` :

| Colonne                   | Sens                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `pickup_address_id`       | **NOT NULL** — un créneau appartient toujours à un comptoir                                                                |
| `weekday`                 | `NULL` = tous les jours ; sinon le jour visé. Type `Weekday`, **défini dans `packages/contracts/src/address.ts`**          |
| `start_time` / `end_time` | bornes locales `HH:MM`, pendule d'Europe/Paris, `start < end`                                                              |
| `slot_minutes`            | le pas de découpe — le « générateur avec une durée »                                                                       |
| `badge`                   | texte **libre**, argument commercial (§2.4). `NULL` = pas de pastille ; `""` est **refusé** à la saisie                    |
| `service_capacity`        | combien de personnes on sert — `NULL` = **aucune limite**, jamais `0` (règle non négociable n° 4 du flux commande). Cf. D3 |

**Plusieurs règles par (point, jour)** — c'est ce qui donne deux badges dans la
même matinée, et c'est la différence avec l'unicité d'`OrderCutoff`.

**D3 — Il y a DEUX capacités, et une seule se règle aujourd'hui** (Hugo,
2026-09-16 : « pensons stock capacity et service capacity, nommons ces champs
sans aller à fond »).

|                       | Ce que ça borne                           | D'où vient le chiffre                                                                     |
| --------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| **`serviceCapacity`** | combien de **personnes** on peut servir   | une **décision du commerçant**, arbitraire et immédiate — « à 7 h 15 je sers 10 clients » |
| **`stockCapacity`**   | combien de **marchandise** reste à vendre | la **production réelle** — ce que le four a sorti. Personne ne le sait encore             |

Les deux sont nommées ici pour que le vocabulaire soit fixé d'entrée : un
créneau peut être plein parce que la file est trop longue, ou parce qu'il ne
reste plus de croissants. Ce ne sont pas les mêmes refus, ni les mêmes phrases
au client.

🔴 **Seule `serviceCapacity` reçoit une colonne.** `stockCapacity` est nommée et
**non portée** : le dépôt a déjà écrit la règle, dans le contexte même que ce
plan prend pour patron — « une colonne qu'on ne saurait pas remplir serait une
dette. Extension prévue : la colonne nullable » (`AvailabilityRule`, à propos de
`staff_user_id`). Elle arrivera quand le fournil saura dire ce qu'il a sorti,
pas avant.

`serviceCapacity` est **facultative** : non renseignée = `NULL` = le créneau ne
refuse personne (Hugo, 2026-09-16).

🔴 **Et c'est le défaut voulu : on ne refuse jamais un client** (Hugo,
2026-09-16). Le champ naît vide, et il restera probablement vide sur la plupart
des créneaux — « ils vont choisir de paramétrer une capacité infinie sur un
créneau plutôt que limiter ».

Ce principe oblige à nommer ce que fait **exactement** une capacité atteinte,
parce que le mot « refus » revient plusieurs fois dans ce plan et s'y lirait de
travers. Une capacité atteinte **ferme une heure et en propose une autre** —
« complet, il reste de la place à 13 h 15 ». Ce n'est pas un refus de vendre,
c'est une orientation, et c'est déjà ce que décrit le handoff. Un refus au sens
propre n'existerait que si **tous** les créneaux d'un jour étaient pleins : il
faudrait pour cela que quelqu'un ait posé des capacités partout, et serrées. Le
défaut vide rend ce cas improbable — délibérément.

✅ **Elle se saisit PAR CRÉNEAU** (Hugo, 2026-09-16). « Combien de personnes sur
une amplitude » se saisissait des deux façons, et elles ne valent pas pareil :
donner le total d'une plage (« 40 entre 7 h et 9 h ») obligerait le système à
**répartir** — donc à diviser, et à **inventer un reste** quand le pas ne tombe
pas juste. La règle porte donc le chiffre par créneau, et c'est l'**écran** qui
affiche le total dérivé (« 5 par créneau de 15 min, soit 40 sur la plage ») : le
réglage reste exact, la lecture reste celle qu'on veut, et rien n'est inventé.

**D4 — Les fermetures datées entrent en v1** (Hugo, 2026-09-16), courtes et
longues. Table `public_pickup_closures` : un **intervalle** `from_day` →
`to_day` (et non un jour unique comme `AvailabilityException`, qui obligerait à
une ligne par jour de congés), bornes horaires optionnelles (`NULL` = journée
entière), motif libre. Une fermeture **prime** sur toute règle.

C'est aussi ce qui répond au contre-exemple du four en panne (§2.4) : un jour
sans fournée se ferme.

**D5 — Une réservation est une ligne, pas deux colonnes sur `orders`.**

La première version ajoutait `pickup_address_id` et `fulfillment_window_start`
sur `orders`. `vitruve` (B2, B3) a montré que ça ne compte pas : le jour ne
serait lisible que sur `requested_delivery_date`, **nullable en base** ; et
surtout, sur le parcours client, **la tranche est facultative et le défaut de
retrait est nul** — donc des commandes de retrait réelles sans créneau,
invisibles au comptage, et une capacité dépassée en silence. C'est exactement le
sens dangereux.

Table `public_pickup_reservations` : `order_id` (unique), `pickup_address_id`,
`day`, `slot_start`. Écrite **dans la même transaction** que la commande, sur le
chemin unique `PrismaOrderRepository.place`.

- le comptage devient un `COUNT(*)` sur un index, sans dépendre d'une colonne
  nullable ni d'un JSON ;
- **aucun rattrapage**, et la vraie raison, qui n'est pas celle qu'on croyait
  (`vitruve` S8) : l'heure **est** connue des commandes antérieures
  (`fulfillment.window`) ; c'est le **point** qui manque, le snapshot ne copiant
  pas l'`id`. On ne rattrape pas parce que la moitié serait à deviner, non parce
  que tout serait inconnu ;
- `orders` n'est pas touchée : son snapshot figé reste la vérité de la commande.

**D6 — Sur un point réglé, le créneau devient obligatoire pour le public.**
C'est ce qui ferme B3 : une capacité ne peut pas compter ce qu'on n'exige pas.
La règle est **portée par la structure neuve** — un point **sans** créneaux
publics garde le comportement d'aujourd'hui, à l'octet près. Rien n'est resserré
sur un contrat déjà servi.

**D7 — L'horaire public d'un point est un agrégat.** Test de tri de CLAUDE.md
§3.1. ⚠️ Mais pas pour les raisons de la première version (`vitruve` S4) : plage
vide, pas trop grand, badge vide portent sur **une** règle et relèvent d'un value
object — le précédent est dans ce contexte même (`PickupDiscount.of`). Le
**seul** invariant inter-règles est le **chevauchement**, et c'est lui qui
justifie `load`/`save` sur l'ensemble.

**D8 — Le chevauchement est refusé par l'agrégat, et la course est assumée.**
`vitruve` (B4) rappelle que deux écritures concurrentes passent toutes deux une
vérification applicative, et que le dépôt l'a écrit noir sur blanc pour les
rendez-vous. C'est vrai. C'est **assumé ici** : l'écriture est un geste
d'administration, rare, à un opérateur ; le coût d'un `EXCLUDE … USING gist`
(extension `btree_gist` à installer en prod **et** dans la base jetable des e2e)
n'est pas payé pour cette fenêtre-là. Si deux admins éditent le même point à la
milliseconde, la seconde écriture gagne.

**D9 — La course sur la dernière place est tolérée** (Hugo, 2026-09-16, par
conséquence du défaut posé en D3). Deux commandes simultanées sur un créneau à
une place passeront toutes deux, et le créneau finira à 11 sur 10.

C'est acceptable parce que le cas suppose **trois** coïncidences : un créneau qui
porte une capacité — or elle naît vide et le restera sur la plupart —, qui soit
**exactement** plein, et deux commandes dans la même fraction de seconde.

Verrouiller coûterait un comptage en transaction sérialisée : Postgres sait
garantir « une seule place » par un index partiel — c'est ce que fait le dépôt
pour les rendez-vous — mais « au plus dix » demande autre chose. Et le prix
serait payé par un client qui perdrait sa commande à la dernière seconde, ce que
le principe de D3 refuse précisément.

Le choix ne ferme rien : ajouter le verrou plus tard est **additif**. À reprendre
si des capacités serrées sont posées et que les dépassements se comptent.

**D10 — Le pas de découpe et les réservations déjà posées.** `vitruve` (S5) :
le jour où `slot_minutes` passe de 60 à 15, les réservations existantes ne
s'alignent plus sur un créneau offert. Elles gardent leur heure (D5 stocke
`slot_start`, pas une référence à une règle) ; le comptage d'un créneau reste
donc juste pour les réservations tombant exactement dessus, et les autres
deviennent invisibles. **Changer le pas d'un point qui a des réservations à
venir est un geste à éviter** — l'écran le dira, plutôt que de le taire.

---

## 5. Ce que ce plan ne fait pas

- **Pas de mutualisation pro/public** : décision explicite de Hugo, remise à
  plus tard. `opening` n'est ni lu, ni écrit, ni renommé par ce plan.
- **Pas de capacité de stock.** `stockCapacity` est nommée (D3) et non portée :
  elle demande que la production sache dire ce qu'elle a sorti, ce qui n'existe
  pas. Aucune colonne ne l'attend — une colonne qu'on ne sait pas remplir est
  une dette, pas une préparation.
- **Ne touche pas aux heures limites** : deux contraintes qui se composent — on
  peut être dans un créneau ouvert _et_ trop tard pour commander.
- **Ne touche pas à la livraison.** ⚠️ Contrairement à ce qu'affirmait la
  première version, la liste de créneaux de livraison de la boutique n'était
  **pas** un lecteur de `opening` : c'était une liste écrite en dur, sans source
  (`vitruve`, mineure). Elle a **disparu le 2026-09-21** avec l'écran qui la
  portait — la remarque reste ici parce qu'elle explique pourquoi ce lot n'a
  jamais eu à en tenir compte.
- **Pas de reprise des commandes passées** (D5).
- **Pas la mise en page** de l'écran d'administration : chantier séparé, sans
  risque, qui peut partir avant.

---

## 6. L'ordre de déploiement

**Purement additif.** Aucun merge ne retire ni ne convertit quoi que ce soit ;
chacun est réversible par un `revert`.

| #     | Contenu                                                                                                                           | Après ce merge                                                     |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **A** | tables, agrégat, fonction pure, routes admin, écran de saisie                                                                     | l'admin peut régler ; **rien ne change pour personne**             |
| **B** | l'accueil public et la boutique lisent les créneaux d'un point réglé ; réservation écrite ; une capacité atteinte ferme son heure | un point réglé sert ses créneaux ; un point non réglé est inchangé |

Un point **sans** créneaux publics se comporte après B exactement comme avant A.
C'est la propriété qui remplace les préconditions de production que la première
version exigeait sans pouvoir les vérifier.

---

## 7. Les lots

**A — serveur** : migration additive (deux tables) ; contrats
(`PublicPickupSlotRule`, `PublicPickupClosure`, fonction pure
`publicPickupSlotsFor(day, rules, closures, taken, now)`) ; agrégat et son refus
de chevauchement ; port, adaptateur, routes
`GET/PUT /admin/pickup-addresses/:id/creneaux-publics` ; fait journalisé
`public_pickup_schedule.updated`, **et son préfixe ajouté aux DEUX classements
du journal** — serveur `activity-module.ts` et front `journal-line.ts`, sans
quoi la ligne affiche le type brut (`vitruve`, mineure) ; e2e : chevauchement
refusé, fermeture qui prime, heure **fermée** quand `serviceCapacity` est
atteinte — avec la suivante encore ouverte, jamais un client sans issue (D3) —,
point non réglé inchangé.

**B — back-office** : le générateur (plage, durée) qui **pose des règles** et
montre l'aperçu des créneaux produits ; badge et capacité par plage ; les
fermetures datées. ⚠️ Ajouté **à côté** de la section « Heures de retrait », qui
ne bouge pas — et `HoursForm` n'est pas touché, il a un second consommateur
(`delivery-specs.ts`).

**C — boutique et accueil public** : le dialogue de créneau lit les règles d'un
point réglé ; badge affiché ; créneau complet visible, barré, avec la prochaine
place libre ; réservation posée à la passation.

**D — plus tard** : mutualisation pro/public ; `ovenHoursOf` ; la livraison.

---

## 8. La contradiction de `vitruve` (2026-09-16) et son sort

| Objection                                                                                                                                                                                                               | Sort                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1** la migration n'existe pas dans le plan ; le merge C détruit les horaires                                                                                                                                         | **disparaît** — plus aucune migration de données (§3)                                                                                                                 |
| **B2** le jour manque pour compter ; `requested_delivery_date` nullable                                                                                                                                                 | corrigée — D5, table de réservation, plus de dépendance à `orders`                                                                                                    |
| **B3** le chemin client n'écrit pas la fenêtre ; comptage faux dans le bon sens                                                                                                                                         | corrigée — D6, créneau obligatoire sur un point réglé                                                                                                                 |
| **B4** chevauchement et capacité sans mécanisme                                                                                                                                                                         | deux moitiés, deux sorts — chevauchement **assumé** (D8, geste d'admin) ; course **tranchée** par Hugo (D9) : on ne refuse jamais un client, et la capacité naît vide |
| **S1** le badge est un fait de production                                                                                                                                                                               | **tranchée contre** par Hugo — c'est un argument commercial (§2.4)                                                                                                    |
| **S2** `taken` est une exclusivité à 1, pas un compte à N                                                                                                                                                               | corrigée — §2.2, l'argument est retiré                                                                                                                                |
| **S3** le `PATCH` efface `opening`                                                                                                                                                                                      | **disparaît** — on n'écrit plus `opening` (§3)                                                                                                                        |
| **S4** l'agrégat justifié par trois refus qui n'en demandent pas                                                                                                                                                        | corrigée — D7, seul le chevauchement le justifie                                                                                                                      |
| **S5** le dénominateur change avec `slot_minutes`                                                                                                                                                                       | corrigée — D10, le geste à éviter est écrit plutôt que taché                                                                                                          |
| **S6** le merge C n'est pas réversible                                                                                                                                                                                  | **disparaît** — tout est additif (§6)                                                                                                                                 |
| **S7** `GET /pickup-addresses` est anonyme, le serveur ne décide pas                                                                                                                                                    | **disparaît** — une règle publique est publique (§3)                                                                                                                  |
| **S8** la raison du non-rattrapage est à moitié fausse                                                                                                                                                                  | corrigée — D5, la vraie raison est le point, pas l'heure                                                                                                              |
| **S9** Q1/Q3/Q4 doivent être tranchées avant le lot A                                                                                                                                                                   | corrigée — tranchées par Hugo le 2026-09-16 (D3, D4, §2.4)                                                                                                            |
| **S10** `badge` : `""`, `NULL` et une valeur disent trois choses                                                                                                                                                        | corrigée — D2, `""` refusé à la saisie                                                                                                                                |
| Mineures : « cinq lecteurs » (il y en a deux), la liste de créneaux de livraison écrite en dur, renvois de lignes faux, `Weekday` vient d'`address.ts`, `HoursForm` a deux consommateurs, le journal a deux classements | corrigées — §1, §5, D2, lot A et B                                                                                                                                    |

---

## 9. Ce que ce plan n'a pas vérifié

- **Les données de production** : combien de points existent, et lesquels
  ouvriront au public. Sans conséquence ici — le plan n'y touche pas — mais
  nécessaire pour dimensionner la saisie.
- **Le coût du comptage** sur `public_pickup_reservations` : non mesuré. Le
  volume est faible par construction (une ligne par commande publique de
  retrait).
- **Ce que voit une app cliente déjà installée** quand un point devient réglé :
  D6 exige un créneau, et un binaire ancien pourrait ne pas le proposer. À
  vérifier avant le merge B — c'est le seul endroit où ce plan peut casser un
  contrat servi.
- **La spécification du dossier de handoff** `handoff-bienvenue/` (hors dépôt) :
  lue partiellement — les sections créneau, capacité et tâches. Elle n'est citée
  ici que par son dossier, à dessein : un chemin de fichier hors dépôt est une
  référence que personne ne peut vérifier, et que la porte compte morte.

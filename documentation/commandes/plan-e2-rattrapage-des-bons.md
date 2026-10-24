# Plan E2 — un bon de livraison pour chaque commande qui en a besoin

> ✅ **Bâti le 2026-10-24** (migration `20261024210000_le_bon_de_livraison_suit_la_commande`,
> réconciliateur `ReconcileDeliveryNotes`, cron horaire du worker, route
> `POST admin/delivery-notes/reconcile` sous `ops_health:write`). Corrige au
> passage la régression d'E1 vue en CI : un numéro de commande atypique
> (`CMD-…` des scènes de test) faisait lever le BL dans l'unité de travail de
> l'arrêt et annulait la confirmation ; un refus du domaine est désormais
> sauté et journalisé. Choix du bâtisseur : un geste réécrit les lignes d'un
> BL prévu avant de l'avancer ; `prepared_at` = `ready_at` s'il existe, sinon
> la remise. **Reste** : aucun signal sur la carte de santé (seulement le
> journal et le compte rendu) ; le passage horaire relit toutes les commandes
> vivantes — à borner quand le volume grandira.

> **Doc-first, 2026-10-24.** Deuxième lot de
> [`plan-commande-bon-de-livraison-facture.md`](plan-commande-bon-de-livraison-facture.md).
> Porte une **migration de données** : `vitruve`, puis `lecteur-de-migrations`
> au bâti. **Rien n'est bâti.** Comme E1, une **ombre** : personne ne lit le BL.

## 0. Ce qui existe (ouvert le 2026-10-24)

- **E1 est bâti** (`5b49793db`) : `delivery_note` porte `order_id`, `rank`,
  `number`, `status` (`planned` · `prepared` · `handed_over` · `voided`),
  `planned_at`, `voided_at` ; `delivery_note_line` recopie SKU, nom, prix,
  taux, quantité, totaux HT et TTC (`prisma/schema/public/delivery-notes.prisma`).
  **Aucune colonne** ne dit quand un BL a été préparé ou remis, ni sa date de
  réception. E1 n'écrit que `planned` (à l'arrêt du plan) et `voided`.
- **La commande** porte `confirmed_at`, `ready_at`, `handed_over_at`,
  `received_on` (`prisma/schema/public/orders.prisma`, l. 300, 313, 337, 174),
  `order_number` unique, et un drapeau « hors plan » (l. 305 : « hors plan » =
  ce drapeau ET `placed`).
- `markReady` admet une commande `placed` ; le retrait aussi (inventaire du
  plan-cadre § 11.4) : une commande peut être prête ou remise **sans** être
  passée par un arrêt, donc sans BL.

## 1. Ce que fait E2

**Après E2, toute commande confirmée, prête ou remise a exactement un BL
vivant**, et l'état de ce BL dit la vérité sur la commande. Deux gestes, dans
une seule migration :

1. **Étendre** `delivery_note` : `prepared_at`, `handed_over_at` (instants,
   nullables) et `received_on` (`date`, nullable), avec les CHECK qui tiennent
   l'état :
   - `prepared` ⇒ `prepared_at` non nul ;
   - `handed_over` ⇒ `prepared_at`, `handed_over_at` et `received_on` non nuls ;
   - `planned` et `voided` ⇒ `handed_over_at` et `received_on` nuls.
2. **Rattraper** : pour chaque commande **non annulée**, avec au moins une
   ligne, au statut `confirmed`, `ready` ou `fulfilled`, **sans BL vivant** :
   un BL-1, ses lignes recopiées de `order_lines` (même règle qu'E1 : TTC tel
   quel, ligne à 0 comprise), et un état tiré de la commande :

| Commande    | BL-1          | Colonnes                                                                        |
| ----------- | ------------- | ------------------------------------------------------------------------------- |
| `confirmed` | `planned`     | `planned_at` = `confirmed_at`                                                   |
| `ready`     | `prepared`    | `planned_at` = `confirmed_at` ou `ready_at`, `prepared_at` = `ready_at`         |
| `fulfilled` | `handed_over` | + `handed_over_at` = celui de la commande, `received_on` = celui de la commande |

Un BL **déjà prévu** par E1 sur une commande devenue `ready` ou `fulfilled`
avant le déploiement d'E3 est **avancé** de la même façon (pas de second BL).

Le numéro suit la règle d'E1 : `BL-` + le numéro de commande sans `ORD-` +
`-1`.

## 2. Comment — une migration SQL, sans script

Une seule instruction par geste, dans une transaction explicite (`BEGIN` /
`COMMIT`, comme `20261024150000`) : tout le schéma `public`, aucune jointure
inter-schémas. Pas de script d'exploitation : Hugo n'exporte pas d'URL de
production (décision du 2026-10-24 sur la reprise de la date de réception).

La règle est simple et dite deux fois (le SQL ici, l'agrégat d'E1 pour le
neuf) ; c'est le prix assumé d'une reprise sans script. Le test le tient : un
e2e compare un BL rattrapé et un BL prévu par E1 sur la même commande.

## 3. Entre E2 et E3

Tant qu'E3 n'est pas déployé, rien n'**avance** un BL : une commande qui
devient prête ou remise après E2 garde un BL `planned`. C'est sans effet
(personne ne lit le BL). **E3 rejoue le rattrapage** (même SQL, idempotent :
« sans BL vivant » ou « BL prévu en retard sur la commande ») dans sa propre
migration, avant de se mettre à écrire.

## 4. Contrôles de la migration

Elle **échoue** (et la transaction annule tout) si, après le rattrapage :

- une commande `confirmed`, `ready` ou `fulfilled` non annulée n'a pas
  exactement un BL vivant ;
- la somme des quantités des lignes d'un BL diffère de celle de sa commande ;
- la somme des `line_total_cents` d'un BL diffère de celle de sa commande.

## 5. Tests

E2E sur la base jetable : une commande de chaque statut (dont une remise hors
plan, sans arrêt), migration rejouée → un BL chacune, à l'état attendu ; une
commande confirmée par E1 puis remise → son BL avancé, pas doublé ; rejouer
le rattrapage → rien ne change.

## 6. Questions

- **Q-E2-1.** Une commande `fulfilled` **sans** `received_on` (aucune depuis
  B4 : deux CHECK l'interdisent) : le CHECK `handed_over ⇒ received_on` est
  donc sûr ; à confirmer par `lecteur-de-migrations` sur la base de prod.

## 7. Contradiction de `vitruve` (2026-10-24) — l'emporte sur les § 1 à § 6

**Le lot change de forme.** Rattraper sans faire suivre laissait le BL mentir
entre E2 et E3 (une commande prête puis annulée gardait un BL `prepared`
vivant ; un BL prévu « avancé » gardait des lignes antérieures à une révision).
**E2 rattrape l'existant ET, à partir de son déploiement, fait suivre le BL à
la commande** : il n'y a plus d'intervalle, et le § 3 tombe.

### 7.1 Le BL suit la commande (écriture neuve, dans E2)

| Geste sur la commande                       | Ce que devient le BL vivant                                                                                                   | Où                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `markReady` (bac fermé, ou prête hors plan) | `prepared`, `prepared_at` ; s'il n'existe pas (hors plan) : BL plein créé `prepared`                                          | même unité de travail que `markReady`     |
| `markFulfilled` (remise)                    | `handed_over`, `handed_over_at`, `received_on` = ceux de la commande ; s'il n'existe pas : BL plein créé `handed_over` (Q-E5) | même unité de travail que `markFulfilled` |
| annulation                                  | tout BL **non remis** passe `voided` (pas seulement `planned`)                                                                | `PlannedDeliveryNoteVoider` élargi        |
| révision (après réouverture)                | un BL `planned` est réécrit à la re-clôture (E1, inchangé)                                                                    | —                                         |

`DeliveryNoteState` et l'adaptateur (`save`) portent les trois colonnes neuves ;
un BL avancé passe par `toState`, jamais par une écriture à part.

### 7.2 Le rattrapage (SQL, dans la migration)

- **Prédicat unique**, le même pour le rattrapage et pour le contrôle :
  commande non annulée, **au moins une ligne**, statut `confirmed`, `ready`
  ou `fulfilled`.
- **Commande sans aucun BL** : BL-1 créé. **BL `planned` existant** : ses
  lignes sont **réécrites** sur `order_lines` (comme `replanFrom`), puis il
  est avancé. **BL `voided` seul sur une commande vivante** : la migration
  **échoue** en la nommant (aucun chemin connu ne le produit ; on ne
  l'invente pas).
- **Instants, fuseau** : `orders.*_at` sont des `TIMESTAMP(3)` sans fuseau
  écrits en UTC ; ils se recopient **`AT TIME ZONE 'UTC'`** vers les
  `TIMESTAMPTZ` du BL (le piège documenté dans `20261024150000`).
- **Hors plan** : `planned_at = COALESCE(confirmed_at, ready_at,
handed_over_at)`, `prepared_at = COALESCE(ready_at, handed_over_at)` ; les
  CHECK d'état restent stricts.
- **Identifiants** : `delivery_note.id` en texte unique produit en SQL
  (préfixe + `order_id`) ; `delivery_note_line.id` = id du BL + rang de la
  ligne sur 4 chiffres, **dans l'ordre des `order_lines.id`** — l'ordre
  lexical des lignes est tenu. Le bâtisseur vérifie que l'agrégat n'exige
  pas un ULID à la réhydratation. `updated_at` posé à `now()`.
- **Numéro** : `'BL-' || substr(order_number, 5) || '-1'`, **après** un
  contrôle `order_number LIKE 'ORD-_%'` sur toutes les commandes visées.
- **Les CHECK d'état** : `prepared` ⇒ `prepared_at` ; `handed_over` ⇒
  `prepared_at`, `handed_over_at`, `received_on` ; `planned` ⇒ les trois nuls ;
  `voided` ⇒ `handed_over_at` et `received_on` nuls (`prepared_at` peut
  rester : un bac fermé puis une commande annulée).

### 7.3 Les contrôles de la migration (échec nommé, transaction annulée)

- aucune commande `in_production` ni `draft` (l'énuméré les porte, aucun
  chemin ne les écrit — `parcours-complet.md` § 8 ; s'il y en a, on s'arrête) ;
- aucune commande `fulfilled` avec `handed_over_at` nul (aucun CHECK ne
  l'interdit : on le **vérifie**, on ne le suppose pas) ;
- tout `order_number` visé commence par `ORD-` ;
- après : chaque commande du prédicat a exactement un BL vivant ; quantités,
  `line_total_cents` et TTC (`IS NOT DISTINCT FROM` sur les sommes) égaux à
  la commande. Ce contrôle ne prouve que la recopie, et c'est ce qu'on lui
  demande.

### 7.4 Avant le merge vers `main` — les comptages à lancer en production

Lecture seule, par Hugo, comme pour la date de réception :

```sql
SELECT
  (SELECT count(*) FROM public.orders WHERE status IN ('in_production','draft'))            AS statuts_morts,
  (SELECT count(*) FROM public.orders WHERE status = 'fulfilled' AND handed_over_at IS NULL) AS remises_sans_instant,
  (SELECT count(*) FROM public.orders WHERE order_number NOT LIKE 'ORD-_%')                 AS numeros_atypiques,
  (SELECT count(*) FROM public.orders o WHERE o.status IN ('confirmed','ready','fulfilled')
     AND NOT EXISTS (SELECT 1 FROM public.order_lines l WHERE l.order_id = o.id))            AS sans_ligne;
```

Les trois premiers doivent rendre 0 ; le quatrième dit combien de commandes
le rattrapage laisse sans BL, à juste titre.

### 7.5 Tests

Le rattrapage est éprouvé par un e2e qui pose l'état « avant » en base puis
**appelle la même fonction SQL** que la migration (la migration la crée et
l'appelle ; elle reste en base pour le rejeu d'éventuelles bases de dev) ; le
suivi par un e2e par geste (bac fermé, prête hors plan, remise, remise hors
plan, annulation d'une commande prête).

## 8. Seconde contradiction (2026-10-24) — l'emporte sur le § 7

**Le rattrapage ne se fait plus en SQL : un réconciliateur, dans le code.**
`vitruve` a montré (BLOQUANT 3) que la migration passe **avant** que le
nouveau code serve : pendant cette fenêtre, l'ancien code (abonnés durables
du colisage et du retrait) avance des commandes sans toucher au BL. Un
rattrapage unique dans la migration ne la couvre pas ; une fonction SQL qui
écrit `delivery_note` serait en plus un second écrivain invisible de
`lint:prisma-model-ownership` (SÉRIEUX 7).

### 8.1 La migration : schéma seulement

Les trois colonnes (`prepared_at`, `handed_over_at`, `received_on`) et les
CHECK d'état du § 7.2. **Aucune donnée écrite.** Les BL existants sont tous
`planned` ou `voided` (E1), donc les CHECK passent sur une table telle
qu'E1 la laisse.

### 8.2 Le réconciliateur

`ReconcileDeliveryNotes` (commande + handler du contexte `delivery-notes`),
déclenché par une tâche périodique de `container/worker.ts` comme les quinze
autres (`triggerOutboxSweep`, `triggerAutoClose`…), et par une route staff
pour un passage à la demande. Par lots bornés, chaque commande dans sa propre
unité de travail (transaction courte, `unit-of-work.ts`) :

- prédicat du § 7.2 (non annulée, au moins une ligne, `confirmed` / `ready` /
  `fulfilled`) ;
- **sans BL** : BL-1 créé par l'agrégat, à l'état de la commande ;
- **BL `planned` en retard** sur une commande `ready` / `fulfilled` : lignes
  réécrites (`replanFrom`), puis avancé ;
- **BL `prepared` sur une commande `fulfilled`** : avancé ;
- **BL vivant non remis sur une commande annulée** : `voided` ;
- **BL `voided` seul sur une commande vivante**, statut `in_production` /
  `draft`, `fulfilled` sans `handed_over_at`, numéro sans `ORD-` : **rien
  n'est inventé** — le cas est compté et remonté (journal, carte de santé),
  jamais réparé en silence.

Il est **idempotent** (une commande juste n'est pas réécrite) et c'est **le
même agrégat** que les gestes du § 8.3 : une seule règle. Son premier passage
en production fait le rattrapage ; les suivants couvrent toute fenêtre de
déploiement, et tout écart qu'un chemin oublié créerait.

### 8.3 Les gestes (le § 7.1, précisé)

- **Transitions de l'agrégat** : `prepare(at)` (`planned` → `prepared`) ;
  `handOver(at, receivedOn)` depuis `planned` **ou** `prepared` — depuis
  `planned`, `prepared_at = handed_over_at` (une commande remise sans bac) ;
  `void(at)` depuis tout état **non remis** (`PlannedDeliveryNoteVoiding`
  renommé `LiveDeliveryNoteVoiding`). Un BL créé hors plan naît par
  `planFromOrder` puis ces transitions.
- **Sous `if (won)`** : le BL ne s'écrit que si l'écriture conditionnelle de
  la commande a franchi (`mark-order-ready.handler.ts`,
  `mark-order-fulfilled.handler.ts`) ; un rejeu ou une réannonce ne réécrit
  rien. Une commande déjà avancée avant E2 est l'affaire du réconciliateur.
- **Un seul port**, élargi : `DeliveryNoteFollowing` (prévoir, préparer,
  remettre, annuler), dans `appBootstrap/delivery-note-planning.module.ts`
  (`@Global`, pour la raison de cycle déjà écrite). Il remplace
  `DeliveryNotePlanning` / `PlannedDeliveryNoteVoiding`. La frontière
  `b2b/orders` → `b2b/delivery-notes` n'est tenue par aucune porte à
  l'intérieur de `b2b` : dit ici, et dans le JSDoc du module.
- **Même unité de travail** : le bâtisseur **établit** que
  `PrismaDeliveryNoteRepository` rejoint la transaction de l'appelant
  (`transaction.store.ts`) avant de le promettre ; sinon il le fait rejoindre.
- **Verrous** : commande puis BL, partout (marques, annulation, re-clôture
  E1 qui absorbe puis prévoit). Une course perdue sur l'unicité
  `(order_id, rank)` (re-clôture contre création hors plan) n'est pas une
  erreur : le geste relit et avance le BL existant.
- **Annulation après remise** : refusée en amont (`cancellationOf` ne permet
  que `placed`) ; un remboursement après remise ne touche pas le BL.

### 8.4 Avant le merge vers `main`

Les comptages du § 7.4, plus deux : « BL `voided` seul sur commande vivante »
et « BL `planned` sur commande `ready` / `fulfilled` » (le volume que le
premier passage avancera). Le runbook dit de lancer le réconciliateur à la
main après le déploiement et de lire son compte rendu.

### 8.5 Tests

Domaine : chaque transition et ses refus. Handler : le réconciliateur sur
chaque cas du § 8.2, idempotence. E2E : bac fermé → `prepared` ; prête hors
plan → BL plein `prepared` ; remise → `handed_over` avec la date ; remise
d'une commande `confirmed` sans bac → `handed_over`, `prepared_at` = remise ;
annulation d'une commande libérée et prête → `voided` ; une commande avancée
« par l'ancien code » (écriture directe en base) → le réconciliateur la
rattrape.

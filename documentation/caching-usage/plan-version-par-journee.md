# Plan — la version par journée : ne relire que ce qui a bougé

> **État : 📐 plan, rien n'est bâti.** Ouvert le 2026-09-28 sur la question de
> Hugo : « combien d'opérations en base pour remplir la Supervision ? », puis
> « il y a presque un doublon de requêtes avec le fournil et le comptoir ».
>
> C'est la **première étape** d'un chemin en trois (§8) ; la dernière est le
> websocket. Celle-ci n'ajoute aucune infrastructure.

---

## 0. Le constat, chiffré

Compté le 2026-09-28 dans le code (fichiers au §2) :

| Moment                              | Opérations facturées |
| ----------------------------------- | -------------------- |
| Ouvrir la Supervision               | ~18                  |
| Chaque relecture (toutes les 15 s)  | 11                   |
| Une heure d'écran ouvert et visible | **~2 760**           |

Le coût suit le **nombre d'écrans ouverts**, pas ce qui change. La
Supervision, la fiche d'atelier et le colisage relisent chacun la même
journée toutes les 15 s ; un matin à quatre postes, c'est quatre fois la
facture, pour une journée qui change quelques dizaines de fois.

Aucune de ces lectures ne fait une requête par commande : le coût est le même
à 5 ou à 200 commandes. Le levier n'est donc pas l'optimisation des lectures,
c'est de **ne pas les faire quand rien n'a bougé**.

---

## 1. L'idée

Chaque journée de service porte un **numéro de version** qui avance à chaque
écriture qui la concerne. Toutes les 15 s, un écran ne demande plus « donne-moi
tout », mais « la version a-t-elle bougé ? ». Une opération au lieu de onze ;
il ne relit que si oui.

Ce numéro servira tel quel au websocket (§8) : le jour où le serveur pousse,
il poussera « la journée X est en version N ».

---

## 2. Ce qui existe

Ouvert le 2026-09-28.

| Fait                                                                                                                                                                                                                                                                   | Où                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Trois écrans relisent toutes les 15 s, **seulement onglet visible**.                                                                                                                                                                                                   | `shared/periodic-refresh.ts` (`REFRESH_INTERVAL_MS`), utilisé par `supervision-page.ts`, `fiche-atelier.ts`, `colisage.ts` |
| Le retrait boutique **ne relit pas sa file** tout seul : son minuteur de 30 s ne fait avancer que l'horloge et le changement de jour. Une file ouverte devient donc fausse sans le dire.                                                                               | `handover-shop/handover-shop-page/handover-shop-page.ts` (`TICK_MS`)                                                       |
| La cloche relit les notifications toutes les 60 s, **même onglet caché**.                                                                                                                                                                                              | `shared/notifications/staff-notifications.store.ts` (`POLL_MS`)                                                            |
| Le droit d'accès staff est en cache 30 s par instance d'API.                                                                                                                                                                                                           | `staff/permissions/prisma-staff-access.resolver.ts` (`CACHE_TTL_MS`)                                                       |
| Une commande porte son jour dans `orders.requested_delivery_date` (`DATE`). Les tables du fournil portent `service_day` (`production_day`, `production_order`, `production_count`, contrôles qualité) ; `production_order_line` et `order_handover` ne le portent pas. | `prisma/schema/public/orders.prisma`, `prisma/schema/production.prisma`                                                    |
| Un retrait met à jour la commande (statut) par l'événement `OrderHandedOverEvent` : il passe donc par `orders`.                                                                                                                                                        | `b2b/orders/application/handlers/on-order-handed-over.handler.ts`                                                          |
| Le dépôt a déjà des déclencheurs Postgres, écrits dans des migrations.                                                                                                                                                                                                 | `20260902120000_referentiel_allergenes`, `20260926120000_les_roles_se_lisent_en_base`                                      |
| `lint:cross-schema-join` interdit le SQL écrit à la main qui joint deux schémas ; elle lit `src/`.                                                                                                                                                                     | `dev-toolbox/gates/cross-schema-join.mjs`                                                                                  |

---

## 3. Les décisions

### D1 — Le numéro avance par un DÉCLENCHEUR, jamais par le code

Écrit dans le code, chaque écrivain devrait penser à l'avancer — la fournée, le
colisage, la clôture, le retirage, la passation, le règlement, l'annulation, le
contrôle qualité, et le prochain qu'on ajoutera. Un seul oubli, et un écran
reste figé **sans que rien ne le dise**, ce qui est pire que de payer.

Un déclencheur sur la table ne s'oublie pas : toute écriture passe par lui,
quelle que soit la route. C'est le cran « refusé en base » de l'échelle du
dépôt, appliqué à une obligation plutôt qu'à un refus.

Bonus : un déclencheur s'exécute **dans la base**. Il n'est pas une opération
envoyée par l'API, donc pas une opération facturée en plus. _(À confirmer sur
la facture de Prisma Postgres au premier mois — non vérifié.)_

### D2 — Un journal de changements, pas un compteur

Un compteur `UPDATE … SET version = version + 1` pose un **verrou sur la ligne
de la journée** jusqu'à la fin de la transaction. La clôture d'une journée est
une longue transaction : pendant ce temps, chaque coche de fournée sur la même
journée attendrait. Deux écritures sans rapport se bloqueraient l'une l'autre
à cause d'un numéro d'affichage.

À la place, une table **en ajout seul** : chaque instruction qui touche une
journée y insère une ligne ; la version est son plus grand identifiant.

```
day_change
  id          bigserial   — la version, croissante
  service_day varchar(10)
  changed_at  timestamptz
  INDEX (service_day, id)
```

Lire la version = `max(id) WHERE service_day = $1`, un parcours d'index. Aucun
verrou partagé entre écrivains.

Déclencheurs **au niveau de l'instruction** (`AFTER … FOR EACH STATEMENT`,
avec les tables de transition `REFERENCING NEW TABLE / OLD TABLE`) : une clôture
qui insère 300 lignes écrit **une** ligne par journée touchée, pas 300.

La table se vide de ses lignes de plus de 7 jours par un balayage : seule la
plus récente compte, et un écran ne regarde jamais une journée d'il y a un mois
en direct.

### D3 — DEUX journaux, un par schéma — la frontière reste en place

Un seul journal commun serait plus simple, et il franchirait la frontière :
un déclencheur de `production` qui écrit dans `public`, ou l'inverse, c'est du
SQL qui traverse deux schémas — exactement ce que `lint:cross-schema-join`
refuse dans le code, et qui ne serait pas plus propre caché dans une migration.

| Journal                 | Schéma       | Tables surveillées                                                                                   | Jour lu                                                            |
| ----------------------- | ------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `public.day_change`     | `public`     | `orders` (insertion, mise à jour, ancien ET nouveau jour si la date change)                          | `requested_delivery_date`                                          |
| `production.day_change` | `production` | `production_day`, `production_order`, `production_order_line`, `production_count`, contrôles qualité | `service_day`, ou celui de sa commande de production (même schéma) |

`order_handover` n'est **pas** surveillée : un retrait change le statut de la
commande, donc `orders`, donc le journal public (§2). La surveiller demanderait
de lui trouver son jour dans une table d'un autre bloc.

`order_lines` non plus : on ne modifie pas les lignes d'une commande sans
toucher la commande elle-même. **À vérifier au bâti** — si un chemin le fait,
ajouter la table.

Chaque bloc lit son propre journal :

- `b2b` : `GET admin/supervision/version?date=` — `b2b_supervision:read` ;
- `production` : `GET admin/production/version?date=` — `b2b_orders:read`,
  comme les postes du fournil.

### D4 — Côté écran : un veilleur partagé

Un service `DayVersionWatcher` dans `shared/` remplace `refreshWhileVisible`
pour les écrans d'une journée :

- toutes les 15 s, onglet visible : il lit les versions **des journaux dont
  l'écran dépend** (Supervision : les deux ; fiche d'atelier et colisage :
  production ; comptoir : public) ;
- si l'une a bougé depuis la dernière lecture, il appelle le rechargement de
  l'écran ;
- **plusieurs écrans d'un même onglet partagent le même veilleur** pour une
  même journée — c'est le « store par domaine » de la discussion, réduit à ce
  qu'il a d'utile : une seule question posée par onglet.

### D5 — Ce qui change avec l'HEURE, sans écriture

« Créneau dépassé » change à 6 h 30 sans que rien ne soit écrit. Une version
ne le verra jamais. Deux gestes :

- la Supervision relit **son jour** (`supervision/day`, 2 opérations) toutes
  les **60 s** quoi qu'il arrive ;
- **tous** les écrans font une relecture complète toutes les **5 minutes** :
  le filet contre un changement qu'aucun journal n'aurait vu (une donnée du
  référentiel, un chemin oublié au §3).

### D6 — Le comptoir se met à jour, enfin

Le retrait boutique ne relit pas sa file aujourd'hui (§2). Il gagne le
veilleur : une commande passée au téléphone ou un sac fermé au fournil
apparaît sur le poste du comptoir en 15 s, au prix d'une opération par tick.

---

## 4. Le compte, après

| Écran ouvert une heure    | Aujourd'hui  | Après                                                                                                  |
| ------------------------- | ------------ | ------------------------------------------------------------------------------------------------------ |
| Supervision               | ~2 760       | 240 × 2 (versions) + 60 × 2 (jour) + 12 × 11 (filet) + 120 (droits) + les vraies relectures ≈ **~850** |
| Fiche d'atelier, colisage | ~même ordre  | 240 × 1 + 12 × relecture + 120 ≈ **~450**                                                              |
| Comptoir                  | ~0 (et faux) | 240 × 1 + 12 × relecture + 120 ≈ **~450**, et juste                                                    |

Environ **trois fois moins** pour la Supervision, et le coût devient
proportionnel aux changements réels : une matinée calme ne coûte presque rien.

Le plus gros poste restant est le **droit d'accès** (120 par heure et par
écran). Le porter à 60 s est un autre réglage, avec sa propre question (un
compte suspendu reste actif une minute) ; hors plan.

---

## 5. Les lots

| Lot    | Contenu                                                                                                                                    | Qui                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| **V1** | Migration : les deux journaux, leurs déclencheurs au niveau de l'instruction, le balayage. e2e : chaque écriture connue avance la version. | `batisseur` + `lecteur-de-migrations` |
| **V2** | Les deux lectures de version, par le bus, et leurs routes.                                                                                 | `batisseur`                           |
| **V3** | `DayVersionWatcher`, branché sur la Supervision, la fiche d'atelier, le colisage et le comptoir ; relecture du jour à 60 s, filet à 5 min. | `pablo`                               |

L'e2e de V1 est le cœur du lot : il passe par **chaque** écrivain connu (passer,
payer, annuler, clôturer, cocher, poser, fermer, retirer, retirer à nouveau,
contrôler) et vérifie que la version a avancé. C'est lui qui dira si un chemin
manque.

---

## 6. Ce qui peut mal tourner

- **Un écrivain que le déclencheur ne voit pas** — une table non surveillée.
  Le filet de 5 minutes borne le retard ; l'e2e de V1 est là pour qu'il n'y en
  ait pas.
- **Une instruction lourde de plus** à chaque écriture : une insertion d'une
  ligne par journée touchée. Négligeable devant les écritures elles-mêmes.
- **Les tests e2e** vident les tables entre deux suites (`ctx.reset()`) ; un
  `TRUNCATE` ne déclenche pas les déclencheurs de ligne ni d'instruction
  d'insertion — les journaux sont vidés avec le reste, rien à faire.

---

## 7. Hors du plan

La cloche des notifications (60 s, onglet caché compris), le cache du droit
d'accès, le prévisionnel (il porte une semaine, pas un jour — il pourra lire
sept versions d'un coup plus tard), la boutique.

---

## 8. Le chemin complet

1. **Ce plan** — la version par journée, et la relecture conditionnelle.
2. Les **stores par domaine** côté écran, au-delà du veilleur partagé.
3. Le **websocket** : un Durable Object par journée et par lieu, derrière la
   passerelle, à qui l'API signale « journée X, version N ». Le veilleur
   cesse de demander et se met à écouter ; le reste ne bouge pas.

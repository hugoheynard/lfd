# Le jeu de données par étapes

> 📐 **Plan — J1 (serveur) bâti le 2026-10-05, pas encore commité ; J2 (écran) à faire.**
> Les étapes ont été réordonnées au premier lot (six au lieu de cinq, tournées
> composées avant la production) : cf. §0. Demande de Hugo : « des étapes à
> cocher — passage de commande, clôture du plan de production, production
> complète, colisage complet, tournées chargées prêtes à partir —, un bouton
> charger et un bouton suivant, avec un chargement qui explique ce qu'on est
> en train de charger, et un reset qui remet à l'état de base ».
>
> Outillage de développement : ni argent, ni migration, ni sécurité, ni
> runbook. Pas de `vitruve` ; les affirmations sur l'existant ont été rouvertes
> le 2026-10-05.

## 0. Ce qui existe (relu le 2026-10-05)

- **La page « Jeu de données »** (`apps/lfd-backoffice-frontend/src/app/dev/seed-page/`)
  a deux boutons : « Recharger les commandes » (`POST /admin/dev/reload/orders`)
  et « Tout recharger » (`POST /admin/dev/reload`). Chacun rejoue tout d'un
  coup, avec un seul « Rechargement… ».
- **La journée du jour** est jouée d'une traite par `seedToday`
  (`apps/lfd-api/src/dev/seeding/orders.seed.ts`) :
  1. passer la file du comptoir et la journée de livraison, la veille ;
  2. clôturer le plan de production (`CloseProductionDayCommand`) ;
  3. avancer le comptoir (fournées, colisage, retraits) et poser une fournée
     reprise ;
  4. avancer la livraison (`advanceDeliveryDay`) : flotte et départ,
     **tournées composées**, PUIS fournées et colisage en bacs, PUIS
     chargement, sans départ.

  ⚠️ **Corrigé le 2026-10-05, au premier lot.** Ce point disait « colisage
  en bacs, tournées composées et chargées » — l'ordre inverse du code. Depuis
  K3c, un bac de livraison naît au colisage, et un demi-bac ne se partage
  qu'entre deux arrêts **consécutifs d'une même tournée** : la tournée doit
  exister quand le Petit Chaudron est colisé. La composition, elle, n'exige
  rien du fournil (l'affectation d'un arrêt ne refuse qu'une commande
  annulée, hors livraison ou d'un autre jour). Les étapes du §1 suivent donc
  l'ordre du code.

- **Les serrures** du `DevSeedService` (base locale seulement, pas en
  production, mur staff, stockage local) restent la condition de tout geste
  de cette page.
- **Le semis est rejouable le même jour** depuis `8fc4b12` (purge des faits
  d'outbox des journées semées).

## 1. Les étapes

Les étapes portent sur **la journée d'aujourd'hui** : le comptoir et la
livraison. L'historique, hier, demain et J+2 sont posés par la base et ne
bougent plus ensuite.

| #   | Étape                                  | Ce que le serveur fait                                                                                                                                                     | Ce que l'écran annonce pendant le chargement                          |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 0   | **Commandes passées** (la base)        | le reset du scénario : ce qu'il avait créé supprimé (§2 bis), toutes les commandes reposées par les vrais gestes                                                           | « Passage des commandes d'hier, d'aujourd'hui et des jours à venir… » |
| 1   | **Plan de production clôturé**         | `CloseProductionDayCommand` pour aujourd'hui                                                                                                                               | « Clôture du plan de production du jour… »                            |
| 2   | **Tournées composées**                 | une tournée par véhicule actif qui a des arrêts, sans bacs ; la première est affectée à qui clique                                                                         | « Répartition des livraisons entre les camionnettes… »                |
| 3   | **Production complète**                | toutes les fournées du jour déclarées sorties du four, et remises au colisage                                                                                              | « Déclaration des fournées sorties du four… »                         |
| 4   | **Colisage complet**                   | chaque commande prête mise en sac (comptoir) ou en bacs (livraison, demi-bac partagé compris), fermée ; la file du comptoir reçoit ses variantes (déjà retirée, en retard) | « Mise en sacs et en bacs, commande par commande… »                   |
| 5   | **Tournées chargées, prêtes à partir** | tous les bacs chargés dans leur tournée, sans départ                                                                                                                       | « Chargement des bacs dans les camionnettes… »                        |

Les commandes **« pas encore prêtes »** du scénario d'aujourd'hui restent
volontairement hors colisage aux étapes 4 et 5, comme aujourd'hui : c'est ce
qui montre un colisage en cours.

## 2. Le serveur

- **`GET /admin/dev/scenario`** rend l'état : l'étape atteinte (lue en base,
  pas mémorisée), et pour chaque étape un résumé (« 17 livraisons, 7 au
  comptoir », « 3 tournées, 51 bacs »).
  - L'étape atteinte se **déduit** : plan clôturé ? toutes les livraisons à
    router dans une tournée du jour ? toutes les fournées du jour déclarées ?
    toutes les commandes prévues au colisage fermées ? tous les bacs chargés ? Une base modifiée à la main donne donc l'étape
    réellement atteinte, jamais une étape mémorisée qui mentirait.
- **`POST /admin/dev/scenario/next`** joue **une** étape, depuis l'étape
  atteinte. Refus nommé si la base est déjà à l'étape 5 (`dev.scenario.complete`).
- **`POST /admin/dev/scenario/reset`** ramène à l'étape 0 (le rechargement
  actuel des commandes, arrêté après le passage).
- **« Charger jusqu'à »** est fait par l'écran : il enchaîne les `next`, un par
  étape. Le serveur n'a pas de route « sauter à » : chaque étape reste un
  geste court, et l'écran sait toujours ce qui est en train de se charger.
- `seedToday` est **découpé** en ces fonctions d'étape. « Recharger les
  commandes » devient `reset` suivi des cinq `next` : même résultat qu'avant,
  par le même code.
- Chaque étape passe par les vrais gestes, comme aujourd'hui. Aucune n'écrit
  en base à la main.

## 2 bis. Le reset ne doit rien laisser derrière lui (Hugo, 2026-10-05)

« Surtout être organisé sur le reset, pour éviter de saturer le Docker. » Le
même jour, deux suites e2e simultanées avaient rempli le disque de la VM
Docker, et Postgres local avait planté (`PANIC … No space left on device`
sur `pg_wal`). Un bouton qu'on presse vingt fois par démo ne doit pas faire
grossir la base ni le stockage.

- **Le reset supprime ce que le scénario a créé**, il ne le recouvre pas :
  commandes et leurs lignes, fournil, colisage, bacs et tournées, **faits
  d'outbox** et leurs livraisons, **journaux** (`day_change` des domaines,
  journal d'activité) et **objets de stockage** (bons de commande PDF,
  photos) que le scénario a écrits dans MinIO. Seulement ce qui appartient
  aux journées et aux clients du scénario : jamais une table entière.
- **Il le fait en une transaction par domaine**, pas une écriture par ligne,
  pour ne pas gonfler `pg_wal`.
- **Il dit ce qu'il a supprimé** : le compte rendu donne, par catégorie, le
  nombre de lignes et d'objets supprimés.
- **Un test le tient** : des `reset` suivis chacun des cinq `next` (cinq
  tours en e2e, pas vingt : une croissance se voit dès le deuxième)
  laissent le nombre de lignes des tables concernées et le nombre d'objets
  du bucket **stables** d'un tour à l'autre. Une croissance fait échouer le
  test, en nommant la table.
- **L'écran affiche la taille de la base** (`pg_database_size`) à côté du
  bouton reset, pour que la dérive se voie avant de bloquer.

## 3. L'écran — extrêmement clair (Hugo, 2026-10-05)

« Il faut que sur l'écran du jeu de données ça soit extrêmement clair, dans
la façon d'expliquer et de manipuler. » Les règles ci-dessous sont la
commande, et les textes sont écrits mot pour mot.

### 3.1 La forme de la page

1. **En tête, une phrase d'état**, en gros : « La journée de démo du
   _lundi 5 octobre_ est à l'étape **3 sur 5** : la production est
   terminée. » Sous elle, la taille de la base (« Base locale : 412 Mo »).
2. **La liste des six étapes**, verticale, dans l'ordre, chacune sur une
   ligne avec, toujours au même endroit :
   - une **pastille d'état** : « Fait » (succès), « Prochaine » (accent),
     « À venir » (neutre), « En cours… » (avec spinner) ;
   - le **titre** de l'étape ;
   - **une phrase qui dit ce que c'est dans la vraie vie** (§3.2) ;
   - quand elle est faite, **son résumé chiffré** et **un lien vers l'écran
     où le voir** ;
   - à droite, l'action « Charger jusqu'ici » (seulement sur les étapes « À
     venir »).
3. **Une seule action principale**, sous la liste, dont le libellé **nomme
   l'étape** : « Étape suivante : Clôturer le plan de production ». À
   l'étape 5, elle disparaît, et la phrase d'état dit « La journée est
   prête : les tournées peuvent partir depuis Ma tournée. »
4. **Le reset tout en bas, séparé**, dans un encadré « Repartir de zéro » :
   bouton « Remettre à l'état de base », confirmation en place qui dit ce
   qui part et ce qui reste (§3.3).
5. **« Tout recharger »** reste dans sa propre section, après, inchangé.

### 3.2 Les textes des étapes

| Étape | Titre                              | Ce que c'est                                                                                                                                              | Après : où le voir        |
| ----- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 0     | Commandes passées                  | Les clients ont commandé hier pour aujourd'hui : 7 au comptoir, 17 en livraison. Rien n'est encore produit.                                               | Commandes                 |
| 1     | Plan de production clôturé         | Le soir, on arrête les commandes du jour : le fournil sait quoi produire.                                                                                 | Fournil → plan du jour    |
| 2     | Tournées composées                 | Le calcul répartit les livraisons du jour entre les camionnettes. Les bacs ne sont pas encore faits.                                                      | Tournées                  |
| 3     | Production complète                | Toutes les fournées sont sorties du four et remises au colisage.                                                                                          | Fournil → fiche d'atelier |
| 4     | Colisage complet                   | Chaque commande est mise en sac (comptoir) ou en bacs (livraison). Trois livraisons restent volontairement en attente, pour montrer un colisage en cours. | Colisage                  |
| 5     | Tournées chargées, prêtes à partir | Tous les bacs sont chargés dans les camionnettes. La première tournée vous est affectée.                                                                  | Tournées, Ma tournée      |

### 3.3 Pendant et après un geste

- **Pendant** : une bannière en haut de la liste, « Étape 3 sur 5 —
  Déclaration des fournées sorties du four… » (la phrase de la colonne de
  droite du §1), une barre de progression par étape, la ligne de l'étape en
  « En cours… ». **Tous** les boutons sont désactivés, et quitter la page ne
  casse rien (le serveur finit l'étape).
- **Après un succès** : la ligne passe « Fait » avec son résumé et son lien ;
  un toast « Plan de production clôturé ». Pas de rechargement de page.
- **Après un échec** : la ligne passe en alerte, avec « Cette étape n'a pas
  abouti » et le message du serveur tel quel ; la liste se relit et montre
  l'étape réellement atteinte ; le bouton dit « Réessayer : … ».
- **Confirmation du reset**, en place : « Remettre la journée de démo à
  l'état de base ? Les commandes, la production, le colisage et les tournées
  du scénario sont **supprimés** puis les commandes sont repassées. Les
  autres clients, le catalogue, les tarifs et l'équipe ne bougent pas. »
  Puis le compte rendu chiffré de ce qui a été supprimé.

### 3.4 Ce que la page ne fait pas

- Pas de vocabulaire technique à l'écran : ni « outbox », ni « seed », ni
  « reset » ; on dit « journée de démo », « état de base », « repartir de
  zéro ».
- Pas de saut d'étape : « Charger jusqu'ici » joue les étapes une par une,
  et l'écran dit laquelle il joue.

## 4. Les lots

| Lot    | Contenu                                                                                                                                                                                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **J1** | serveur : découpage de `seedToday` en étapes, déduction de l'étape atteinte, trois routes, **reset qui supprime tout ce qu'il a créé (§2 bis)**, tests (dont : `reset` puis 5 × `next` = l'ancien rechargement ; `next` à l'étape 5 refusé ; état déduit après une étape faite à la main) |
| **J2** | écran selon le §3 **mot pour mot** : phrase d'état, liste des étapes avec pastilles, textes et liens, action principale nommée, bannière de chargement, reset séparé et confirmé                                                                                                          |

## 5. Questions pour Hugo

- **Q1 — Les sous-comptes de démo** (« Alpes », « Cimes ») suivent-ils les
  étapes ? _Défaut : non, ils restent posés par `seed:sub-accounts` ; leurs
  commandes sont sur des jours passés._
- **Q2 — Une étape « tournées parties »** après l'étape 5 ? _Défaut : non, le
  départ se fait à l'écran, c'est ce qu'on montre._

# Composer les tournées automatiquement — plan

> 📐 **Plan, rien n'est bâti** (2026-10-03). Hugo : « avec la masse de
> commandes, chaque nouvelle commande devrait automatiquement s'intégrer dans
> une tournée ; déplacer une livraison ok, mais pas tout ».
>
> Il déplace une **frontière de concurrence** (un traitement de fond écrit dans
> des tournées que des humains modifient) et touche le **commerce** (le réglage
> de l'heure demandée) : `vitruve` avant Hugo.

## 1. Ce qui existe (relu le 2026-10-03)

- **« Proposer »**, en deux modes, tourne à la demande
  ([`algorithme-de-preparation-de-tournee.md`](algorithme-de-preparation-de-tournee.md)).
  Le mode **Insérer** (`insert-into-rounds.ts`) place des commandes dans les
  tournées existantes sans réordonner les arrêts placés à la main : c'est le
  geste unitaire dont on a besoin.
- **Une fenêtre sans début existe déjà** : `TimeWindow.start` vaut `null` pour
  « dès l'ouverture » (`route-timing.ts`). Le calcul optimise la **fin** en
  priorité absolue (`isBetterScore`, L7t-C1).
- **Le départ d'une tournée** vaut `max(heure au plus tôt, début de la
première fenêtre − trajet)` (`route-timing.ts`, `vehicle-plan.ts`). L'heure au
  plus tôt est un réglage (06:00 par défaut). Sans début de fenêtre, la tournée
  part donc à 06:00, même si une échéance à 06:00 exigeait de partir à 05:00.
- **La capacité du véhicule n'est vue nulle part** à la composition
  ([`todo-calculateur.md`](todo-calculateur.md)).
- Une flotte vide ou un véhicule sans cotes laissent « Proposer » tourner ; le
  plan de chargement dit `unknown_cargo`.

## 2. Décisions d'Hugo (2026-10-03)

### CA-D1 — Règle 1 : tout le monde est servi avant son échéance

C'est la seule règle qui prime. On part aussi tôt qu'il le faut, **même à
2 h du matin**. Les contraintes du travail (heures du livreur, repos) **ne sont
pas du ressort de l'outil** : il n'en modélise aucune.

Conséquences sur le calcul :

- l'**heure au plus tôt** cesse d'être un plancher : le départ se calcule **à
  rebours**, au plus tard possible qui sert encore chaque arrêt avant son
  échéance ;
- une composition qui ne peut pas tenir toutes les échéances avec la flotte
  (même en partant tôt, même en ouvrant des passages) est un **échec signalé**,
  arrêt par arrêt, jamais un retard accepté en silence.

### CA-D2 — Des échéances plutôt que des créneaux, réglage du commerce

Un réglage de livraison **global, surchargeable par adresse** (le même grain
que les autres réglages de livraison) : « créneau » ou « échéance ».

- En **échéance**, on ne saisit qu'une heure limite (« avant 6 h 00 ») ; la
  fenêtre n'a pas de début.
- Une adresse qui exige un vrai créneau (« pas avant 7 h ») garde son début.
- L'affichage dit « avant 6 h 00 » partout où il disait « 05 h–06 h ».

### CA-D3 — Au moins un véhicule et un bac paramétrés, sinon rien

Composer n'a pas de sens sans eux. Sont **obligatoires** :

- au moins **un véhicule actif avec ses cotes** (volume utile, plancher) ;
- au moins **un type de bac actif**.

Sans eux, « Proposer » et le placement automatique **refusent** avec la phrase
qui dit quoi régler et où. L'écran de la flotte et celui des bacs refusent
d'archiver le dernier.

### CA-D4 — Chaque commande entre toute seule dans une tournée

L'humain corrige, il ne construit plus. Voir §3.

## 3. Le placement automatique — proposition à contredire

1. **Le déclencheur** : une commande devient livrable (confirmée, adresse
   située, jour connu). Elle est insérée, seule, par le mode Insérer, dans les
   tournées **non chargées** de son jour.
2. **La capacité** : une insertion n'est acceptée que si `planLoading` tient
   encore pour la tournée (compactage permis), sur la demande en bacs de la
   commande — bacs déclarés, sinon estimés par les contenances, sinon
   « inconnue » : la commande reste à répartir, signalée.
3. **L'épinglage** : un arrêt déplacé à la main est épinglé. Le calcul ne le
   bouge plus ; il insère entre les épinglés.
4. **La réoptimisation du soir** : à l'heure limite de commande de la veille,
   les arrêts **non épinglés** sont recomposés (une insertion au fil de l'eau
   est gloutonne). Ensuite tout est figé jusqu'au chargement.
5. **Le journal** : chaque placement automatique est écrit (« ajouté à
   Camionnette 2, arrêt 4, par le calcul ») et l'arrêt porte un marqueur
   « placé automatiquement ».
6. **Ce qui ne tient nulle part** reste à répartir, avec sa raison
   (« ne tient avant son échéance avec aucun véhicule », « capacité »).

## 4. Ordre des lots

| Lot     | Contenu                                                                     | Dépend de |
| ------- | --------------------------------------------------------------------------- | --------- |
| **CA1** | CA-D3 : véhicule et bac obligatoires                                        | —         |
| **CA2** | CA-D1 : départ à rebours, échec signalé par arrêt                           | —         |
| **CA3** | CA-D2 : réglage créneau / échéance, saisie et affichage                     | —         |
| **CA4** | la capacité à la composition (demande en bacs, `planLoading` à l'insertion) | CA1       |
| **CA5** | le placement automatique, l'épinglage, le journal                           | CA2, CA4  |
| **CA6** | la réoptimisation du soir                                                   | CA5       |

## 5. Questions ouvertes

Tranchées par Hugo le 2026-10-03 :

- **Une tournée chargée n'est jamais touchée** par l'automatique : un seul bac
  chargé la fige (la règle de « Proposer » aujourd'hui, `classifyRounds`).
- **Pas de livraison sans échéance ni créneau** : le commerce refuse de passer
  une commande livrée sans l'une ou l'autre. Lève V5 pour l'avenir ; les
  commandes déjà passées sans fenêtre restent à traiter (signalées, jamais
  réécrites).

- ~~**Q1**~~ — **Tranchée par Hugo le 2026-10-03** : la borne basse est
  **minuit du jour de livraison**. Une commande pour le jour J, échéance 6 h,
  peut partir à 1 h : c'est encore le jour J. Rien ne part la veille — le
  modèle (secondes depuis minuit, `clock-time.ts`) tient tel quel.

- ~~**Q2**~~ — **Tranchée par Hugo le 2026-10-03** : la durée maximale
  d'une tournée **cède** devant la règle 1. C'est une contrainte du travail,
  qu'on ne modélise pas (CA-D1). `maxRoundMinutes` cesse d'être une borne dure
  (`vehicle-plan.ts:159`, `overSeconds`) ; il peut rester un **signal**
  (« tournée longue ») sans jamais refuser une place.
- ~~**Q3**~~ — **Tranchée par Hugo le 2026-10-03** : l'objectif est de
  **calculer à chaque nouvelle commande si elle passe**, sur une volumétrie
  d'environ **200 clients livrés par jour**. Une commande pour J+2 est donc
  placée (ou jugée) dans la composition de J+2 dès qu'elle arrive, tournées
  ouvertes par le calcul s'il le faut. Conséquences à mesurer avant de bâtir :
  la matrice routière à ~200 points (OSRM `/table` par blocs, lot 8 bis), et
  l'amélioration locale, mesurée à 60 arrêts sous deux secondes
  (`improve-plans.ts`), à remesurer à 200.
- **Q4** — Le géocodage : à la commande, pour que l'automatique puisse placer ?
- **Q5** — Un véhicule « paramétré » exige-t-il aussi les passages de roue et
  la caisse froide, ou les cotes suffisent-elles ?

## 7. v2 — le prévisionnel vit dans « Organisation de tournées » (Hugo, 2026-10-03)

> « Notre problématique, c'est la planification : il faut un estimate en temps
> réel à chaque nouvelle commande. » — puis : « ça peut être dans /tournées,
> c'est exactement le but. »

**Le principe.** Pour un jour **à venir**, « Organisation de tournées » ne
montre pas des tournées vides à remplir : elle montre la **composition
prévisionnelle** du jour, recalculée à chaque commande qui entre, change ou
s'annule. C’est l’aperçu de « Proposer » (le handoff « Tournées », §6),
devenu **permanent et vivant**.

- Elle dit en continu : véhicules et passages nécessaires, heure de départ de
  chaque tournée (à rebours, CA-D1), remplissage (litres + plancher), et les
  commandes **à risque** (échéance intenable, capacité).
- On y **glisse** comme aujourd'hui en aperçu : un geste humain devient une
  **contrainte** du prévisionnel (« cette commande dans ce véhicule, à cette
  place ») que les recalculs respectent — l'épinglage.
- À l'**heure limite de commande** de la veille, le prévisionnel est
  **appliqué** aux tournées réelles, une fois (ou avant, par « Appliquer »).
  Ensuite on est sur le réel : correction à la main, chargement, départ.

**Ce que ça lève dans la contradiction (§6).**

|                     | Comment                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| V1 versions         | le recalcul n'écrit pas dans les tournées réelles ; une seule écriture, à l'heure limite                                                        |
| V2 déclencheur      | un recalcul est rejouable sans risque ; un raté se rattrape au suivant. Reste : le port commerce → livraison « une commande livrable a changé » |
| V3 épinglage        | les contraintes humaines vivent sur le prévisionnel ; il faut les stocker (migration additive), pas une colonne sur l'arrêt réel                |
| V4 départ à rebours | inchangé : la passe arrière par véhicule reste à bâtir (Q1, Q2 tranchées)                                                                       |
| V5 sans fenêtre     | levé pour l'avenir : échéance obligatoire à la commande                                                                                         |

**Ce qui ne passe pas** est **accepté et signalé** (« à risque ») : on ne
refuse pas une commande sur une estimation tant qu'on ne l'a pas comparée au
réel pendant quelques semaines. Ensuite, le même calcul pourra alimenter le
parcours de commande.

**Ordre v2** : CA1 (véhicule, bac, échéance obligatoires) → CA2 (départ à
rebours, durée max en signal) → CA4 (capacité) → **banc à 200 clients** →
le prévisionnel (stockage, recalcul à chaque commande, contraintes humaines,
affichage dans Organisation de tournées) → l'application à l'heure limite.
CA3 (réglage créneau/échéance) en parallèle.

**Ouvert** : où vit le prévisionnel (table neuve ou recalcul à la lecture),
qui déclenche le recalcul (port du canal, file), et ce que voit le bureau
quand deux personnes glissent dans le même prévisionnel.

## 6. Contradiction de `vitruve` (2026-10-03) — à corriger avant de bâtir

Le plan v1 ci-dessus **ne tient pas en l'état**. Cinq objections bloquantes,
toutes confrontées au code :

| #   | Objection                                                                                                                                                                                                                                                                                                                            | Ce qu'elle impose                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | **Versions** : chaque placement automatique incrémente la version de la tournée (`delivery-apply-support.ts:42-54`) ; l'humain qui vient de lire se fait refuser son geste suivant, en boucle, et l'automatique n'a pas de stratégie quand l'humain l'a devancé.                                                                     | Un geste automatique qui ne vieillit pas la lecture humaine (version de composition vs version d'arrêts), ou une file sérialisée par jour avec nouvelle tentative bornée. À concevoir. |
| V2  | **Déclencheur** : aucun port ne permet au commerce de dire « cette commande est livrable » (`delivery/channels/commerce/index.ts`). Un `AfterCommit` qui échoue n'est que journalisé (`after-commit.ts:18-19`). Retrait et déplacement (commande annulée, adresse ou jour modifiés) absents.                                         | Un port neuf dans le canal, déclaré par la livraison ; une file durable (pas un rappel perdu) ; le cycle complet : placer, déplacer, retirer, idempotent.                              |
| V3  | **Épinglage** : le mode Insérer épingle aujourd'hui **tous** les arrêts existants (`insert-into-rounds.ts:69`). Distinguer « placé à la main » de « placé par le calcul » exige une **colonne** sur `DeliveryRoundStop` (`delivery.prisma:188-207`).                                                                                 | Migration additive + mapper ; règle de ce que fait `applyProposal` du drapeau.                                                                                                         |
| V4  | **Départ à rebours** : les passages s'enchaînent (le n+1 part au retour du n, `vehicle-plan.ts:142-146`) ; le calcul est dupliqué dans `timeRoute`, `scoreVehicle`, `time-composition.ts`, et `vehicle-availability.ts` / `byPriority` partent de l'heure au plus tôt. `maxRoundMinutes` est une borne dure (`vehicle-plan.ts:159`). | Une passe arrière par véhicule ; **Q2 tranchée avant CA2**.                                                                                                                            |
| V5  | **Une commande sans fenêtre n'a pas d'échéance** : le créneau est figé dans la commande à la passation (`order-fulfillment.parse.ts:38-50`), `null` par défaut. Réécrire les créneaux convenus serait réécrire une déclaration sans geste humain. « Avant HH:MM » s'affiche déjà (`order-sheet-pdf.ts:188`).                         | CA-D2 s'applique aux commandes **à venir** ; il faut une échéance par défaut pour une commande sans fenêtre (réglage).                                                                 |

Sérieux, à trancher aussi :

- **02:00 la veille ne se représente pas** : le temps compte en secondes depuis
  minuit du jour de service, et l'heure se replie sur 24 h
  (`clock-time.ts:20-27`). Q1 conditionne le modèle.
- **Aucun planificateur** dans l'API : la réoptimisation du soir demande un
  déclencheur neuf (le Worker a des crons ; l'API, non).
- **« Tournée non chargée »** n'est pas un état : une tournée à moitié chargée
  est-elle figée ?
- **Un auteur système** au journal : `delivery-author.ts` suppose un staff.
- **Flottes déjà vides** : CA1 doit dire ce qui se passe à la mise en
  production.

**Ordre corrigé** : trancher Q1, Q2, Q3, V5 ; puis CA1 ; CA2 (départ à
rebours, sur la décision Q1/Q2) ; CA3 ; la migration d'épinglage et le port de
déclenchement (V2, V3) ; CA4 ; CA5 avec sa stratégie de versions (V1) ; CA6.

## 8. Contradiction de la v2 par `vitruve` (2026-10-03), et ce que j'en propose

| #   | Objection                                                                                                                                                                                                         | Proposition (à valider par Hugo)                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | « L'heure limite de la veille » n'est pas un instant unique : `OrderCutoff` a plusieurs lignes par jour de semaine et point, chacune son `daysBefore` (`orders.prisma:645-657`) ; un jour peut n'en avoir aucune. | **Pas d'application automatique.** L'application reste le geste « Appliquer » du bureau ; l'écran **alerte** quand un jour approche sans être appliqué. Plus de cron, plus d'auteur système.                                                                          |
| B2  | Des commandes entrent **après** l'heure limite, par dérogation (`OrderCutoffWaiver`, `orders.prisma:615-640`).                                                                                                    | Sur un jour déjà appliqué, une commande neuve arrive dans « À répartir » avec **sa place suggérée** (insertion pré-calculée, en aperçu) ; un clic l'applique. L'automatique ne réécrit jamais le réel.                                                                |
| B3  | `applyProposal` exige les versions lues (`delivery-apply-support.ts:42-54`) ; des tournées réelles futures existent déjà (`delivery.prisma:125-165`).                                                             | Conséquence de B1 : seul un humain applique, avec ce qu'il a lu — la mécanique existante tient. Un jour **est** prévisionnel tant qu'il n'a aucune tournée réelle ; dès la première, il est réel (S6).                                                                |
| B4  | La doctrine du canal : « l'écran suit les deux versions ; jamais un déclencheur qui écrit chez l'autre » (`commerce-day-version.reader.ts:1-12`) ; `day_change` et `CommerceDayVersionReader` existent.           | **Recalcul à la lecture**, mis en cache sur (jour, version commerce, version des contraintes, version de la flotte). Aucun port neuf, aucune file. « Temps réel » = l'écran suit la version, comme aujourd'hui.                                                       |
| S1  | Il faut stocker les contraintes humaines ; coût à 200 points (OSRM : 4 blocs, 2 vagues ; amélioration mesurée à 60).                                                                                              | Une table de **contraintes seules** (migration additive) ; la composition est un cache. Banc à 200 avec **seuil écrit** : recalcul < 5 s, insertion d'une commande < 1 s (à valider).                                                                                 |
| S2  | Deux recalculs concurrents.                                                                                                                                                                                       | Le cache est clé par versions : un résultat plus ancien n'écrase jamais un plus récent ; rien d'autre n'écrit.                                                                                                                                                        |
| S3  | Une contrainte devient impossible (commande annulée, véhicule retiré, échéance intenable) ; deux personnes glissent en même temps.                                                                                | Annulée / véhicule retiré : la contrainte tombe d'elle-même, dite. Échéance intenable : **question à Hugo** (la règle 1 prime-t-elle sur un geste humain ?). Concurrence : version sur l'ensemble des contraintes du jour, refus du second avec relecture.            |
| S4  | Crons en UTC, heures limites locales.                                                                                                                                                                             | Levé par B1 (pas de cron).                                                                                                                                                                                                                                            |
| S5  | Application à mi-chemin.                                                                                                                                                                                          | Levé par B1/B3 : application humaine, atomique comme aujourd'hui.                                                                                                                                                                                                     |
| S6  | Ce que montre l'écran à J, J+1, J+2.                                                                                                                                                                              | Jour **sans** tournée réelle : le prévisionnel, glissable (contraintes). Jour **avec** tournées réelles : le réel, plus les commandes non placées avec leur place suggérée.                                                                                           |
| S7  | V1/V3/V5 pas entièrement levés ; « à risque » vs échéance obligatoire.                                                                                                                                            | L'échéance obligatoire est une règle de **saisie** au commerce (pas de commande livrée sans heure) ; « à risque » est une **estimation** de planification : la première vient avant, elles ne se contredisent pas. Les commandes passées sans fenêtre sont signalées. |

Mineurs pris : Q4 (géocodage à la commande) devient un prérequis du
prévisionnel ; « change » = adresse, jour, fenêtre, lignes (donc bacs) ou
annulation — exactement ce que `day_change` enregistre déjà, à vérifier.

## 9. Tranché par Hugo (2026-10-03)

- **L'application au réel est un clic du bureau** (« Appliquer »), jamais
  automatique. L'écran alerte quand un jour approche sans être appliqué.
  Le placement de chaque commande, lui, reste automatique **dans le
  prévisionnel**.
- **Le geste humain gagne** sur le calcul. S'il rend une commande non
  réalisable (échéance intenable, capacité dépassée), la commande passe en
  **alerte rouge** — visible au tableau, dans le résumé « à régler », et sur
  sa carte — sans que le calcul défasse le geste.

Reste à fixer avec Hugo : les seuils du banc à 200 clients (proposés :
recalcul complet < 5 s, insertion d'une commande < 1 s).

## 10. v3 — la synthèse à bâtir (2026-10-03)

> Ce qui fait foi désormais : les §2, §5, §9 et cette section. Les §3, §4 et
> §7 sont l'historique de la conception.

**Le déclencheur, proposé par Hugo** : « l'arrêt de production est aussi le
trigger pour le calcul des tournées ». La **clôture de la journée de
production** (`ProductionDay.close`, `production-day.ts:240`) est un fait
unique par jour — ce que l'heure limite de commande n'est pas (B1). C'est le
moment où la liste des commandes à fabriquer, donc à livrer, est figée :

- avant la clôture, le prévisionnel du jour vit et se recalcule ;
- à la clôture, un **calcul définitif** recompose tout le jour en respectant
  les verrous humains (une commande placée à la main ne bouge pas) ; ce
  prévisionnel est **final** : l'écran le signale « prêt à appliquer », et le
  bureau clique « Appliquer » (§9) — Hugo, 2026-10-03 ;
- une reprise de la journée (`retake`) rouvre le prévisionnel.

⚠️ À vérifier avant de bâtir : `delivery → production` est **interdit** par
la matrice des blocs (CLAUDE.md §3). La livraison doit lire « la journée J
est-elle close ? » par un port de SON canal, implémenté par qui le sait —
comme elle lit le commerce. Et le jour de production d'une commande livrée
est-il son jour de livraison ?

**Les lots, dans l'ordre :**

| Lot      | Contenu                                                                                                                                                                                                      | Migration     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| **CA1**  | Au moins un véhicule actif avec cotes et un type de bac actif, sinon « Proposer » refuse avec la phrase ; on n'archive pas le dernier. Échéance ou créneau obligatoire à la commande livrée.                 | non           |
| **CA2**  | Départ à rebours par véhicule (passe arrière, passages enchaînés), plancher minuit du jour (Q1) ; `maxRoundMinutes` devient un signal (Q2).                                                                  | non           |
| **CA3**  | Réglage créneau / échéance (global, surchargeable par adresse) ; affichage « avant HH:MM ».                                                                                                                  | oui, additive |
| **CA4**  | La capacité à la composition : demande en bacs par commande, `planLoading` à l'insertion.                                                                                                                    | non           |
| **Banc** | 200 clients de la vallée : recalcul complet < 5 s, insertion d'une commande < 1 s.                                                                                                                           | non           |
| **CA5**  | Le prévisionnel : recalcul à la lecture, cache sur (jour, version commerce, version flotte, version contraintes) ; table des contraintes humaines ; alerte rouge quand un geste rend une commande intenable. | oui, additive |
| **CA6**  | La clôture de production comme signal « prêt à appliquer » ; place suggérée pour une commande arrivée sur un jour déjà réel.                                                                                 | non           |

## 11. Contradiction de la v3 (2026-10-03), et la v4 proposée

**Bloquants de `vitruve` et réponse :**

| #   | Objection                                                                                                                                                                                                 | v4                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Un calcul « définitif » pur n'est pas définitif (la version du commerce bouge encore après la clôture : `absorbIntoPlan`, dérogations) ; figé, il faudrait l'écrire, sur un déclencheur de la production. | **Le calcul définitif est celui que fait « Appliquer »**, au clic, sur l'état du moment et en respectant les verrous. Rien n'est stocké avant ; la clôture ne déclenche aucune écriture, elle **autorise et signale** (« prêt à appliquer »).                                                  |
| B2  | Aucun port ne dit à la livraison que le jour est clos ; `delivery → production` est fermé ; `ProductionDayClosedEvent` vit dans `production/channels/commerce/`.                                          | Un **lecteur** dans `delivery/channels/commerce/` (« la journée J est-elle close ? »), implémenté par le **commerce**, qui lit la production par son port permis (`b2b → production`, port uniquement). Une lecture, pas un déclencheur : la doctrine du canal tient, la matrice ne bouge pas. |
| B3  | `retake` n'efface pas `closedAt` ; aucun signal de reprise.                                                                                                                                               | La reprise **ne rouvre rien** : le jour reste clos, les commandes absorbées apparaissent « à placer », avec leur place suggérée. Phrase « la reprise rouvre » retirée.                                                                                                                         |

**Sérieux pris :**

- Le jour de fabrication **est** le jour de livraison, par convention (`serviceDay` = `requestedDeliveryDate`, `prisma-day-orders.reader.ts:47`) : écrit ici, à tenir.
- **Pas de cache en v4.** Recalcul à la lecture, mesuré au banc ; un cache ne viendra que si le banc l'exige, et alors avec une clé qui couvre **toutes** les entrées (réglages, bacs, géocodage, flotte, contraintes), dans une table — les backends sont sans état.
- **Le banc** mesure le **calcul pur** (matrice exclue, mesurée à part) : 200 arrêts, 4 véhicules, 2 passages permis, 10 contraintes, matrice chaude, médiane et p95 sur 20 tirages, sur le poste de dev ; seuil p95 < 5 s. Le seuil « insertion < 1 s » est retiré (il n'y a plus d'insertion). Le jeu : 200 points tirés dans les communes servies, graine fixe.

**Lots v4 :**

| Lot      | Contenu                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **CA1**  | Livraison : véhicule actif avec cotes + type de bac actif obligatoires (Q5 : les cotes suffisent, proposé)                                 |
| **CA1b** | Commerce : échéance ou créneau obligatoire à la commande livrée ; les commandes passées sans fenêtre sont signalées, jamais réécrites      |
| **CA2**  | Départ à rebours, durée max en signal _(en cours)_                                                                                         |
| **CA3**  | Réglage créneau / échéance, affichage « avant HH:MM »                                                                                      |
| **CA4**  | Capacité à la composition                                                                                                                  |
| **Banc** | Ci-dessus                                                                                                                                  |
| **CA5**  | Le prévisionnel à la lecture ; table des contraintes avec version de l'ensemble par jour (deux glisseurs : le second relit) ; alerte rouge |
| **CA6**  | Le lecteur « jour clos » (B2) ; « Appliquer » = calcul définitif ; écran « prêt à appliquer »                                              |
| **CA7**  | La place suggérée d'une commande arrivée sur un jour déjà réel (dérogation, reprise)                                                       |

**Tranchées par Hugo le 2026-10-03 :**

- **Q4** : l'adresse est **située à la commande** — le prévisionnel ne
  place que ce qui a un point. Lot **CA0** ci-dessous, prérequis de CA5.
- **Q5** : un véhicule « paramétré » = **ses cotes** (volume utile et
  plancher). Passages de roue et caisse froide restent facultatifs.

| Lot     | Contenu                                                                                                                                                    |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CA0** | Situer l'adresse de livraison à la commande (géocodage déjà en cache, `delivery_geocode`) ; une adresse non située reste signalée, jamais placée au hasard |

## 12. CA2 bâti (`0cf2aaf30`) — trois points validés par Hugo (2026-10-03)

- La passe arrière **vise la marge de sécurité** quand elle est tenable ; le
  retard se mesure sur la vraie fin de fenêtre.
- L'heure « au plus tôt » des réglages devient l'heure de départ d'une tournée
  qu'**aucune** échéance ne presse. Son libellé à l'écran est à renommer
  (CA3).
- Plus rien ne pousse à couper une journée : une seule tournée longue plutôt
  que trois est acceptée. **Pas de pénalité** sur la durée.

## 13. CA3 — créneau ou échéance : le détail (2026-10-03, carte relevée le jour même)

**Ce qui existe déjà :**

- **La fenêtre d'une commande sait déjà être une échéance** :
  `fulfillmentWindowSchema.start` est nullable, « `null` = avant `end` »
  (`packages/contracts/src/address.ts:49-58`), et le livreur la reçoit telle
  quelle (`delivery_stop_execution.delivery_window`).
- **Le créneau préféré d'une adresse, lui, exige un début** :
  `deliverySlotSchema` (`address.ts:26-34`), dans
  `addresses.delivery_specs` (JSON).
- **Le motif « global, surchargeable par adresse » existe trois fois** : la
  signature (`companies` + `delivery_specs.signatureRequired`), la porte
  (`delivery_doorstep_settings` + `addresses.doorstep_rule`), le temps sur
  place (`delivery_routing_settings` + `delivery_specs.stopMinutes`).
- La boutique formate déjà « avant 8 h » (`format-hour.ts`).

**Ce que CA3 bâtit :**

| Couche                | Changement                                                                                                                                                | Migration                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Réglage global        | `windowMode: "slot" \| "deadline"` sur les réglages de livraison du commerce (`public.delivery_settings`), défaut `slot` — rien ne change pour l'existant | **additive** (une colonne enum, défaut) |
| Surcharge par adresse | `delivery_specs.windowMode: "slot" \| "deadline" \| null` (null = hérite), même motif que `stopMinutes`                                                   | non (JSON, champ optionnel)             |
| Créneau préféré       | `deliverySlotSchema.start` devient nullable (une échéance préférée) ; les données existantes ont un début, elles restent valides                          | non                                     |
| Passation             | en mode échéance, la fenêtre demandée a `start: null` ; un début fourni est refusé à la forme                                                             | non                                     |
| Résolution            | le mode d'une commande = celui de l'adresse, sinon le global ; servi aux fronts avec les défauts de livraison (`DeliveryDefaults`)                        | non                                     |
| Affichage             | « avant HH:MM » partout où le début est nul (back-office, boutique, PDF, e-mails) — formateurs existants à aligner                                        | non                                     |
| Réglage de routage    | l'heure « au plus tôt » renommée à l'écran : « Départ quand rien ne presse » (CA2) ; la colonne ne change pas                                             | non                                     |

CA1b (échéance **obligatoire** à la commande livrée) se bâtit dans la même
passe côté passation : une commande livrée sans fenêtre est refusée, avec la
phrase.

Une seule migration, additive : `lecteur-de-migrations` avant `main`.

**Précision d'Hugo (2026-10-03) : plusieurs échéances par adresse.** Une
adresse peut recevoir plusieurs commandes le même jour (6 h le pain, 11 h le
déjeuner). Chaque commande garde **une** fenêtre, et le calcul fait déjà un
arrêt par commande : deux échéances, deux arrêts. Ce qui change, c'est le
préréglage : en mode échéance, l'adresse porte **une liste d'échéances
préférées** (`delivery_specs`, champ additif, sans migration) ; la commande en
choisit une, ou une autre heure — une échéance de la liste vaut `default`.

## 14. CA3b — plusieurs créneaux par jour sur une adresse (Hugo, 2026-10-04)

> « fais en sorte qu'on puisse avoir plusieurs créneaux aussi » — une adresse
> commande parfois le matin ET pour une soirée.

**Décision.** Le créneau suit les échéances (§13) : une adresse porte une
**liste** de créneaux, la même tous les jours ou une par jour. Une commande,
elle, n'en porte toujours qu'**un** : à la passation, on le choisit dans la
liste du jour ; si la liste est vide, on saisit début et fin (comportement CA3).
La composition ne change pas — elle lit la fenêtre de la commande.

**Forme.** `deliverySlotsSchema` devient :

```ts
{ mode: "everyday", slots: DeliverySlot[] }          // [] = aucun créneau
{ mode: "perDay",   byDay: { mon: DeliverySlot[] | null, … } }
```

Liste triée par début, sans chevauchement (`slots[i-1].end <= slots[i].start`),
refusée au contrat sinon. Un helper `slotsFor(slots, day)` miroir de
`deadlinesFor`.

**Les adresses déjà enregistrées — pas de SQL.** `delivery_specs` est un
`jsonb`. Le schéma **lit** l'ancienne forme par `z.preprocess` :
`{mode:"everyday", slot: S|null}` → `{slots: S ? [S] : []}`, et un `byDay[d]`
objet → `[objet]`. Il **écrit** toujours la nouvelle. Aucune réécriture de
masse : une adresse bascule à sa prochaine modification. La lecture tolérante
reste tant qu'une ligne d'ancienne forme existe (requête de comptage donnée à
Hugo avant de la retirer, en trois temps).

**Contrat servi.** Serveur et écrans (boutique + back-office + `@lfd/b2b-ui`)
partent dans le même déploiement que CA3. Un onglet ouvert sur l'ancien front
lirait `slots.slot` absent → il afficherait « aucun créneau » jusqu'au
rechargement : accepté, rien n'est écrit faux (l'ancien front renverrait
l'ancienne forme, que le serveur lit encore).

### 14.1 Contradiction de `vitruve` (2026-10-04) et v2 de CA3b

Trois BLOQUANTS, tous levés en changeant la forme plutôt qu'en la tolérant :

1. **Un onglet resté sur l'ancien front effacerait les créneaux** en renvoyant
   `slot: null` sur une adresse déjà passée en liste. → On ne change PAS
   `slots`. On AJOUTE un champ, comme `deadlines` :
   `DeliverySpecs.slotList: PreferredSlots | null` (optionnel), de grain
   `{mode:"everyday", slots: S[]} | {mode:"perDay", byDay:{mon: S[]|null,…}}`.
   Le serveur, à l'écriture, **dérive `slots` (l'ancien) du premier créneau de
   chaque jour** de `slotList` : l'ancien front lit toujours quelque chose de
   juste. Si un payload arrive SANS `slotList` (ancien front), le serveur
   **conserve la `slotList` stockée** au lieu de l'effacer.
2. **Le dépôt du carnet** (`prisma-company-address.repository.ts`) fait entrer
   le jsonb brut : il parse désormais par `deliverySpecsSchema` comme le reader.
3. **Pas de `preprocess`** : plus de forme à tolérer, le problème disparaît.

Retenus aussi : lecture d'une `slotList` absente = repli sur `slots` (liste
d'un élément) via un helper `slotsFor(specs, day)` — seul point de lecture ;
le préremplissage de la passation (`prisma-delivery-defaults.reader.ts`) prend
le créneau seulement si la liste du jour en a **un seul**, sinon on choisit ;
le refine « trié, sans chevauchement » ne vaut qu'à l'écriture (payload), pas
dans le schéma de lecture. Fixtures e2e : au moins une en nouvelle forme.
Resserrement (retrait de `slots`) : plus tard, trois temps, non daté.

### 14.2 Le réglage général par défaut : échéance (Hugo, 2026-10-04)

`delivery_settings.window_mode` passe par défaut à `deadline`. La migration
CA3 (`20261003090000`) est appliquée en dev : on ne la touche pas, une
migration suivante fait `ALTER COLUMN … SET DEFAULT 'deadline'` et
`UPDATE … SET window_mode = 'deadline'` (aucune ligne en production n'a encore
cette colonne : rien n'y est écrasé de ce qu'un humain aurait choisi). Le
`@default` Prisma et le repli applicatif (`resolveWindowMode`) suivent.

### 14.3 Bâti (contrats + serveur), et ce qui reste ouvert (2026-10-04)

Questions à Hugo, ouvertes :

- **Q-CA3b-1 — l'ancien onglet.** Un payload sans `slotList` garde la liste
  stockée, et l'ancien `slots` en est re-dérivé : un créneau changé depuis un
  onglet resté sur l'ancien front, sur une adresse déjà en liste, est écrasé
  sans message. La liste ne s'efface jamais. Fenêtre : juste après le
  déploiement. À accepter ou à refuser (refuser = 409 « rechargez la page »).
- **Q-CA3b-2 — la saisie début/fin à la passation** quand le carnet n'a pas de
  créneau ce jour-là (adresse saisie à la volée) : à confirmer.
- **Q-CA3b-3 — le message d'erreur résiduel** d'un créneau mal saisi qui reste
  affiché après passage en échéance : corriger ou noter.

- **Q-CA3b-4 — « un autre créneau »** à la passation quand l'adresse en a
  plusieurs (les échéances le permettent ; les créneaux non, pour l'instant).

Tranché (Hugo, 2026-10-04) : **toute la démo passe en échéance** — adresses
semées avec échéances préférées, commandes semées en `{start:null,end}`.

## 15. CA6 révisé — la livraison écoute la clôture (Hugo, 2026-10-04, option B)

> « pourquoi la livraison n'est pas abonnée aussi ? l'arrêt du compte de prod
> signe aussi les commandes à livrer » — puis : « option B, ouvre l'arête ».

**Ce qui change par rapport au §9 et au §10 (B2).** CA6 prévoyait que la
livraison **lise** « ce jour est-il clos ? » au commerce, et que la clôture
n'écrive rien côté livraison. Depuis la boîte d'envoi
(`journalisation/plan-boite-d-envoi.md`), la clôture publie un fait durable,
`production.day_closed`. La livraison **s'y abonne** :

- **avant la clôture** : rien ne change. Le prévisionnel des tournées se
  recalcule à la lecture, à chaque commande ; c'est le « temps réel » du §7 ;
- **à la clôture** : l'abonné de la livraison passe le jour en « prêt à
  appliquer », alerte le bureau, et relit au commerce, par son canal
  existant, les commandes du plan arrêté (`orderIds` du fait) avec leurs
  adresses et leurs échéances. Le clic « Appliquer » reste au bureau (§9) ;
- **au retirage** : un fait des commandes absorbées (à publier par le
  retirage, comme `production.packing_list_drawn`) donne à la livraison les
  commandes arrivées après la clôture. Elle propose leur place (CA7).

**L'arête.** La matrice interdisait `production ↔ delivery`. Hugo a choisi
d'ouvrir **`delivery → production`, par `production/channels/delivery/`
seulement** (le fait, rien de l'agrégat) ; `production → delivery` reste
interdit. Le commerce ne relaie pas les faits des autres : il ne publie que
ceux dont il est propriétaire. Ouvert le 2026-10-04 dans CLAUDE.md §3 et
`lint:context-boundaries` ; le canal ne porte encore que le fait de clôture,
sans abonné.

**À faire avant de bâtir CA6** : contredire ce §15 par `vitruve` (frontière),
et trancher l'abonnement au fait du retirage.

## 16. CA6 v2 — après la contradiction du §15 (2026-10-06)

> Hugo, 2026-10-06 : « l'arrêt du compte de production devrait publier un
> message et livraison devrait proposer automatiquement le plan de tournée ».
> `vitruve` a contredit le §15 le même jour : deux BLOQUANTS (rien ne peut
> porter « prêt à appliquer » ; le fait du retirage existe déjà, hors canal,
> sans `orderIds`). Ce paragraphe REMPLACE le §15 là où ils divergent. Rien
> n'est bâti.

### 16.1 Ce qui existe (relu le 2026-10-06)

- La clôture, manuelle **et** automatique, passe par `CloseProductionDayCommand`
  (`bus-automatic-day-closer.ts`) et publie `production.day_closed` avec ses
  `orderIds` — retrait **et** livraison mêlés (`prisma-day-orders.reader.ts`).
  Chaque réannonce est un fait distinct (clé `…:reannounced:<instant>`).
- `production/channels/delivery/index.ts` n'exporte que ce fait ; aucun
  abonné côté livraison.
- Le retirage publie `production.day_retaken`
  (`retake-production-day.handler.ts`), charge `{ serviceDay, retakenAt,
absorbed }` : un **compte**, pas la liste. Le fait vit dans
  `production/domain/events/`, hors canal : la livraison ne peut pas le lire.
- La proposition de tournées se **calcule à la lecture**
  (`get-delivery-round-proposal.handler.ts`) ; `DeliveryProposalRepository`
  ne sait que l'appliquer. Aucune table de proposition ni de jour.
- L'abonné du commerce (`on-production-day-closed.handler.ts`) fait passer les
  commandes en `confirmed` ; aucun ordre n'existe entre lui et un abonné de la
  livraison.
- Le jour de production d'une commande EST son jour de livraison
  (`requestedDeliveryDate = serviceDay`, `prisma-day-orders.reader.ts`) — la
  question du §10 est close.

### 16.2 La proposition

**L'abonné ne fige aucune proposition. Il range un ÉTAT et sonne.**

1. **Une table `delivery.delivery_day_readiness`**, clé
   **(`service_day`, `closed_at`)** : une ligne par clôture, pour qu'une
   clôture future après réouverture (Q7) ait sa place sans écraser ni être
   refusée. Colonnes : `state` (`ready` | `not_proposable`), `reason`
   (texte lisible, nul si `ready`), `order_count` (livraisons du fait),
   `absorbed_order_ids` (retirages reçus depuis), `created_at`, `updated_at`.
   Migration **additive**. Le §10 (« CA6 : migration non ») est faux, corrigé
   ici.
2. **La proposition reste calculée à la lecture** (§7) : l'écran des tournées
   la recalcule quand on l'ouvre. Elle n'est jamais périmée, et elle ne gêne
   jamais le bureau, qui a peut-être déjà composé à la main : le mode
   « Insérer » ne place que ce qui ne l'est pas. Ranger ne sert qu'à SAVOIR
   que le jour est prêt et à le DIRE. « Appliquer » reste au bureau (§9).
3. **À la clôture**, l'abonné (`@DurableHandler`, livré au moins une fois) :
   - borne le jeu aux `orderIds` **du fait**, jamais au statut `confirmed`
     (l'abonné du commerce peut ne pas être passé) ;
   - n'en garde que les **livraisons** (lu au commerce par le canal existant
     `delivery/channels/commerce/`) ;
   - essaie le calcul à blanc. S'il refuse pour une raison métier (pas de
     véhicule ou de bac paramétré — CA-D3 —, route indisponible, départ non
     situé), il range `not_proposable` avec la phrase du refus. **Il ne lève
     jamais sur un cas métier** : une `DomainError` dans un abonné durable
     serait reprise puis deviendrait un message mort, rejoué pour une
     situation normale. Même règle que « Appliquer » depuis `3e9da566c`.
   - sonne la cloche du bureau : « Le plan du mercredi 7 octobre est arrêté :
     12 livraisons à mettre en tournées » ou « … : impossible de proposer les
     tournées — <raison> ».
4. **Idempotence et ordre** : l'unité est (`service_day`, `closed_at`). Un fait
   déjà rangé ne fait rien (pas de seconde cloche). Une réannonce porte le
   même `closedAt` que sa clôture : elle met à jour la ligne sans sonner de
   nouveau. Un fait dont le `closedAt` est plus ancien que la dernière ligne du
   jour est ignoré.
5. **Au retirage** :
   - `production.day_retaken` **passe dans le canal**
     `production/channels/delivery/` (comme le prévoit son JSDoc) ;
   - sa charge gagne `orderIds` (les commandes absorbées) ; la relecture
     tolère les faits déjà écrits sans ce champ (comme E3 l'a fait pour
     `reannouncedAt`) : sans liste, l'abonné range le compte et sonne sans
     détail ;
   - l'abonné ajoute les livraisons absorbées à la dernière ligne du jour et
     sonne « 2 nouvelles livraisons à placer ».
6. **L'écran des tournées** lit l'état du jour : un bandeau « Plan arrêté —
   prêt à appliquer » avec le bouton « Proposer » mis en avant, ou la raison
   du refus.

### 16.3 Ce qui reste à vérifier avant de bâtir

- La matrice dit `delivery → staff : ✓ (autorisation)`. La cloche vit dans
  `staff/notifications/` ; le commerce l'importe directement. Que la
  livraison y ait droit n'est **pas vérifié** dans `lint:context-boundaries` ;
  sinon, un port `delivery` que `appBootstrap` relie.
- L'ordre de livraison des faits par la boîte d'envoi entre deux clés n'est
  pas établi (`outbox-relay.ts` non lu) ; la règle 4 ne suppose aucun ordre.
- Ce que « Insérer » fait des commandes absorbées après la clôture
  (`insert-into-rounds.ts`, non relu).

### 16.4 Lots

| Lot      | Contenu                                                                             | Migration |
| -------- | ----------------------------------------------------------------------------------- | --------- |
| **CA6a** | la table, l'abonné à la clôture, la cloche, l'état lu par l'écran (route + bandeau) | oui       |
| **CA6b** | `day_retaken` dans le canal avec `orderIds`, l'abonné du retirage                   | non       |

### 16.5 Contradiction de `vitruve` (2026-10-06) et corrections

Deux BLOQUANTS, cinq SÉRIEUX. Ce qui suit corrige 16.2 ; là où ils divergent,
16.5 fait foi.

- **B1 — pas de calcul dans l'abonné.** Un abonné durable tourne dans une
  transaction (`platform/outbox/durable-delivery-guard.ts`) ; le calcul de
  proposition appelle OSRM (`DistanceMatrix`). L'abonné **ne calcule rien** :
  il range l'ensemble des livraisons et sonne. La seule vérification qu'il
  fait est en base, sans réseau : CA-D3 (au moins un véhicule et un type de
  bac paramétrés) — sinon la cloche le dit. Une route indisponible n'est
  jamais rangée : l'écran la constate à l'ouverture, comme aujourd'hui.
  L'état `not_proposable` disparaît.
- **S1 — la clé est le jour.** Une journée close ne se rouvre pas
  (`close-production-day.handler.ts`, vérifié le 2026-10-06) : une ligne par
  `service_day`. Si Q7 (« rouvrir le plan ») est décidée un jour, elle
  apportera sa migration.
- **B2, S2, S3 — un ENSEMBLE, pas des compteurs, et aucun ordre supposé.**
  La ligne porte `delivery_order_ids` (ensemble) et `closed_at` (nullable).
  Chaque fait — clôture, réannonce, retirage — fait l'**union** de ses
  livraisons dans l'ensemble ; un fait rejoué, ou une réannonce qui recouvre
  des absorbées, n'ajoute rien. Un retirage qui arrive avant sa clôture crée
  la ligne avec `closed_at` nul ; la clôture le pose ensuite. La cloche ne
  sonne que si l'ensemble **grandit**, et dit de combien : « Le plan du
  mercredi 7 octobre est arrêté : 12 livraisons à mettre en tournées », puis
  « 2 nouvelles livraisons à placer ».
- **S4 — tolérance des anciens retirages.** `ProductionDayRetakenEvent.fromPayload`
  accepte un fait sans `orderIds` (test dédié) ; l'abonné le reconnaît et ne
  fait rien, sans lever. Deux sources de la liste des arrivées existeront
  (`publishArrivals` pour le colisage, `day_retaken` pour la livraison) :
  assumé, chacune sert son canal.
- **S5 — l'écran.** Nouvelle query + route sous `delivery_rounds` en lecture.
  Trois états : pas de ligne (plan non arrêté : rien), arrêté (bandeau
  « Plan arrêté — N livraisons, dont P hors tournée », « Proposer » mis en
  avant), arrêté sans flotte ni bac (bandeau d'alerte CA-D3).
- 16.3 : la livraison importe `staff/notifications` sans canal
  (`dev-toolbox/gates/context-boundaries.mjs`), et « Insérer » prend les
  absorbées comme non placées (`insert-into-rounds.ts`) — réglés.

Table finale, `delivery.delivery_day_readiness` : `service_day` (clé),
`closed_at` (nullable), `delivery_order_ids` (`text[]`), `created_at`,
`updated_at`. Lots inchangés (CA6a avec migration, CA6b sans).

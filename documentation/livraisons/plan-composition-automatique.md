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

- ~~**Q1**~~ — **Tranchée par Hugo le 2026-10-03** : la borne basse est
  **minuit du jour de livraison**. Une commande pour le jour J, échéance 6 h,
  peut partir à 1 h : c'est encore le jour J. Rien ne part la veille — le
  modèle (secondes depuis minuit, `clock-time.ts`) tient tel quel.

- ~~**Q2**~~ — **Tranchée par Hugo le 2026-10-03** : la durée maximale
  d'une tournée **cède** devant la règle 1. C'est une contrainte du travail,
  qu'on ne modélise pas (CA-D1). `maxRoundMinutes` cesse d'être une borne dure
  (`vehicle-plan.ts:159`, `overSeconds`) ; il peut rester un **signal**
  (« tournée longue ») sans jamais refuser une place.
- **Q3** — Une commande pour J+2 : sa tournée n'existe peut-être pas encore.
  Le calcul l'ouvre-t-il, ou attend-il le soir de la veille ?
- **Q4** — Le géocodage : à la commande, pour que l'automatique puisse placer ?
- **Q5** — Un véhicule « paramétré » exige-t-il aussi les passages de roue et
  la caisse froide, ou les cotes suffisent-elles ?

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

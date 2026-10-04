# Produire par vagues — quelles quantités, pour quelle heure

> Hugo, 2026-10-04 : « maintenant qu'on a les échéances, il va falloir tenir
> compte de quelles quantités partielles d'un produit doivent être produites à
> quelle heure. » État : **doc-first**, rien de bâti. Relie trois chantiers :
> les échéances (CA3), la composition des tournées (CA2, CA6) et le colisage
> (`colisage/plan-domaine-colisage.md`, Q4). `vitruve` d'office : il touchera
> au compte à produire (migration) et à la frontière production ↔ livraison.

## 1. Ce qui existe (relu le 2026-10-04)

- **Le compte à produire** est une ligne par `(service_day, sku)`
  (`ProductionCount`), arrêtée à la clôture. Un total pour la journée.
- **Les fournées** (`production_batch`, bâti le 2026-09-28,
  `plan-fournees-progressives.md`) : « sorti » est la somme des fournées
  non annulées, par SKU, pour la journée.
- 🔴 **Décision 3 de ce plan-là** : « sortir du four, c'est mettre à
  disposition du colisage — un seul geste. Le transfert est **total**. » La v3
  du colisage (§10, option b : un geste « envoyer au colisage » à part) la
  **contredit**. Voir Q1.
- **Les échéances** (CA3) : chaque commande livrée porte une fenêtre
  `{start|null, end}` ; un retrait aussi.
- **Les heures de départ** (CA2) : la composition calcule, à rebours depuis
  les échéances, l'heure de départ au plus tard de chaque tournée
  (`route-timing.ts`, `latestDepartures`). Elles bougent tant que la
  composition n'est pas appliquée (CA6 : « Appliquer » est le calcul
  définitif ; la clôture de production **autorise et signale** « prêt à
  appliquer », elle n'écrit rien côté livraison).

## 2. L'idée

On remonte depuis l'échéance :

```
échéance client
  ← trajet depuis le départ de sa tournée        (CA2)
  ← chargement, colisage                          (marges réglées)
  ← sortie du four de ses lignes                  ⇒ heure au plus tard de la ligne
```

Une **vague** regroupe les lignes qui doivent être sorties pour la même heure.
Le compte à produire devient **un total par SKU et par vague** :

| SKU      | Vague « départ 05:10 » | « départ 08:40 » | « retraits 11:00 » |
| -------- | ---------------------- | ---------------- | ------------------ |
| Baguette | 120                    | 60               | 25                 |

- **Une vague livraison** = une tournée (ou plusieurs qui partent ensemble),
  à l'heure de départ au plus tard, moins les marges de colisage et de
  chargement.
- **Une vague retrait** = l'heure de la fenêtre (le début s'il y en a un,
  sinon la fin), moins la marge de colisage.
- Les marges sont des **réglages du commerce**, pas des constantes : on ne
  les invente pas (sans réglage, pas de vague calculée — l'écran le dit).

## 3. Prévision, puis figé

| Moment                      | Les vagues sont…                                                | Source                                            |
| --------------------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| Avant la clôture du fournil | une **prévision**, recalculée à la lecture                      | le prévisionnel des tournées (CA5)                |
| À la clôture                | **figées** dans le compte à produire                            | l'instantané des tournées au moment de la clôture |
| Après « Appliquer » (CA6)   | inchangées ; un écart avec les tournées réelles est **signalé** | comparaison, pas réécriture                       |

La clôture fige ce qu'elle voit : le fournil ne peut pas attendre un clic du
bureau pour savoir quoi enfourner. Si « Appliquer » déplace ensuite une
commande d'une tournée de 05:10 à une de 08:40, sa ligne reste dans la vague
où le fournil l'a produite — produire plus tôt n'est jamais faux — et l'écart
inverse (avancée) est **alerté** au fournil : « 12 baguettes manquent pour
05:10 ».

## 4. Ce que ça change

- **Production** : `production_count` gagne une clé de vague. Le compte par
  SKU de la journée devient la somme des vagues. La fiche d'atelier montre la
  journée en vagues, dans l'ordre des heures.
- **Fournées** : une fournée se déclare **pour une vague** (par défaut, la
  plus urgente qui n'est pas pleine). « Sorti » devient par `(sku, vague)`.
- **Colisage** : la remise se fait par vague (Q1) ; la réserve par
  `(jour, sku)` de la v3.1 devient `(jour, sku, vague)`, ou reste par SKU si
  une pièce sortie pour 08:40 peut servir 05:10 (Q3).
- **Livraison** : publie à la production l'instantané « commande → heure de
  vague » au moment de la clôture. Le fournil le **demande** (port du canal)
  ou le **reçoit** (fait durable) : Q4.

## 5. Questions pour Hugo

- **Q1 — la remise** : le 2026-09-28, tu as décidé « sortir du four = mettre à
  disposition du colisage, un seul geste ». Le 2026-10-04, tu as choisi un
  geste « envoyer au colisage » à part (option b). Avec les vagues, je
  propose de **revenir à ta décision du 28** : sortir une fournée pour une
  vague = la remettre au colisage. La vague donne le grain, sans geste de
  plus. D'accord ?
- **Q2 — les marges** : un temps de colisage et un temps de chargement,
  réglés une fois (par commerce), ou par tournée ?
- **Q3 — une pièce de la vague de 08:40 peut-elle servir la vague de 05:10 ?**
  (Oui = la réserve reste par SKU, et la vague n'est qu'un ordre de priorité.
  Non = elle est cloisonnée.)
- **Q4 — qui donne les heures au fournil** : il les lit à la clôture (port,
  lecture synchrone, comme aujourd'hui pour la file du retrait), ou la
  livraison les publie (fait durable) ?
- **Q5 — une commande sans tournée** à la clôture (pas encore composée) : elle
  va dans quelle vague ? Proposé : la vague de son échéance, calculée sans
  trajet (au plus tôt), et signalée.

## 6. Lots (provisoires, après les réponses)

| Lot | Contenu                                                                          | Migration             |
| --- | -------------------------------------------------------------------------------- | --------------------- |
| V0  | Les marges en réglage ; l'aperçu des vagues (lecture seule) dans le prévisionnel | additive              |
| V1  | Le compte à produire par vague, figé à la clôture ; la fiche d'atelier en vagues | données (trois temps) |
| V2  | Les fournées par vague ; la remise par vague (colisage v3.1)                     | additive              |
| V3  | L'écart après « Appliquer », alerté au fournil                                   | non                   |

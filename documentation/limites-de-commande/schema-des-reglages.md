# Le schéma des réglages de limite de commande

> Écrit le 2026-10-21, à la demande de Hugo : « on a atteint quelque chose
> d'incompréhensible à paramétrer, on va commencer par un doc schéma ». Il
> dessine l'**existant** (code relu le 2026-10-21, via les docs d'état du
> dossier) et nomme ce qui embrouille — c'est le point de départ de la
> simplification, pas une proposition. Entrée du dossier : [`README.md`](README.md).

## 1. La carte : huit réglages, quatre écrans, quatre droits

```mermaid
flowchart TB
  subgraph E1["Réglages › Commandes › Heure limite<br/>droit lfc_order_settings"]
    R1["① Heure limite GÉNÉRALE<br/>« la veille, 23 h » + rattrapage<br/>(order_cutoffs, ligne par défaut)"]
    R1b["①bis Règles par point × jour<br/>(même table) — lues, NON éditables"]
    R2["② Interrupteur<br/>activée / désactivée"]
    R3["③ Jour même<br/>autorisé / non"]
    R7["⑦ Dérogation (carte du même écran)<br/>une société, une journée, pendant le rattrapage<br/>droit b2b_order_waivers"]
  end
  subgraph E2["Référentiel › Limites de commande + fiche produit<br/>droit pim_catalog"]
    R4["④ Limite d'ARTICLE<br/>jours avant + heure + rattrapage<br/>rangs : global → famille → produit → déclinaison"]
  end
  subgraph E3["Production (fournil)"]
    R5["⑤ Arrêt du plan<br/>auto à HH:MM ou manuel"]
  end
  subgraph E4["Opérations datées"]
    R6["⑥ Fenêtre d'opération<br/>commande du … au …"]
  end
  subgraph E5["Comptabilité › Surtaxe de retard<br/>droit b2b_late_fee"]
    R8["⑧ Surtaxe de retard<br/>montant + taux de TVA,<br/>ajoutée quand une dérogation sert"]
  end
```

## 2. Le chemin d'une commande : qui peut dire « trop tard »

```mermaid
flowchart TD
  C["Commande pour la journée J"] --> S{"③ J = aujourd'hui<br/>et jour même interdit ?"}
  S -- oui --> X1["refus : jour même fermé"]
  S -- non --> P{"⑤ plan de J arrêté ?"}
  P -- "oui (client)" --> X2["refus : plan arrêté"]
  P -- non --> L["Pour CHAQUE ligne :<br/>la plus stricte entre<br/>④ limite de l'article<br/>et ① la règle générale (si ② activée)"]
  L --> PAN["Le panier : la ligne la plus fermée gagne"]
  PAN --> D{"décision"}
  D -- ouverte --> O{"⑥ article d'une opération :<br/>dans sa fenêtre ?"}
  D -- "rattrapage" --> W{"⑦ dérogation ?"}
  W -- "oui (+ ⑧ surtaxe)" --> O
  W -- non --> X3["refus : « appelez-nous »"]
  D -- fermée --> X4["refus : trop tard"]
  O -- oui --> OK["✅ commande acceptée"]
  O -- non --> X5["refus : hors fenêtre de l'opération"]
```

Et la boutique **annonce** (sans rien décider) à partir de ① ② ③ ⑤ et ④ :
« Pour jeudi, commandez avant 23 h », « Plus que 2 h 15… », « Préparé sur
commande — … ». Le devis n'appelle aucune de ces gardes.

## 3. Ce qui rend le paramétrage incompréhensible

Chaque point est un fait du code, avec l'exemple qui le rend concret.

1. **Deux « limites globales », dans deux écrans, pour deux droits.** ① « la
   veille à 23 h » (Réglages, `lfc_order_settings`) et le rang **global** de ④
   (Référentiel, `pim_catalog`) disent la même chose — une heure pour tout le
   catalogue. _Exemple : en dev, ① dit la veille 18 h et ④ global dit la veille
   18 h avec 60 min de rattrapage ; laquelle compte ? Depuis le 2026-10-21, la
   plus stricte, grâce comprise — il faut lire le code pour le savoir._
2. **Le rattrapage existe trois fois, et il a un prix ailleurs.** Sur ①, sur
   chaque rang de ④, et la dérogation ⑦ qui ne vaut que pendant lui — sur
   l'écran de ①, avec un droit à elle ; ce qu'elle coûte (⑧, la surtaxe) se
   règle en Comptabilité, sous un troisième droit. Aucun écran ne montre le
   rattrapage qui s'appliquera vraiment à un panier, ni ce qu'il coûtera.
3. **L'échelle de ④ hérite CHAMP PAR CHAMP.** Une famille peut fixer les jours,
   le produit l'heure, la déclinaison le rattrapage : la limite d'une
   déclinaison est un assemblage de trois rangs. _Exemple : « 2 jours » (famille)
   - « 12 h » (produit) — aucune ligne en base ne dit « 2 jours, 12 h »._
4. **Des règles invisibles.** ①bis : des règles par point et par jour peuvent
   exister en base et s'appliquer à la passation, mais l'écran ne les édite
   pas (« non reprises »). La boutique, elle, ne compare la limite d'un
   article qu'à la règle par défaut.
5. **Trois façons de couper une journée, chez trois métiers.** ③ jour même
   (Réglages), ⑤ arrêt du plan (fournil, à une heure à lui), ① limite
   (Réglages). _Exemple : ① à la veille 23 h mais ⑤ en arrêt automatique à 20 h
   → la boutique annonce 23 h, la passation refuse à 20 h._ (Aujourd'hui en
   prod : arrêt manuel, donc pas de conflit — lu le 2026-10-21.)
6. **L'opération ⑥ a sa propre fenêtre, sans rattrapage ni dérogation,** et
   s'applique APRÈS les autres — une bûche peut passer ④ et être refusée par ⑥.
7. **Un interrupteur qui ne coupe qu'un des deux globaux.** ② désactive ① ;
   le rang global de ④ continue de s'appliquer.
8. **Le devis ne vérifie rien** : un devis peut être accepté puis refusé à la
   passation.
9. **Ce qui est en base n'est pas ce qu'on croit.** En prod le 2026-10-20, on
   pensait l'heure limite « désactivée le 14 octobre » : elle ne l'était qu'en
   dev ; la prod n'a aucune ligne d'interrupteur, donc elle est activée par
   défaut.

## 4. Les questions à trancher pour simplifier

- **Une seule limite « pour tout le catalogue »** : ① ou le rang global de ④ ?
  L'autre disparaît.
- **Un seul rattrapage**, ou aucun (et la dérogation devient le seul geste) ?
- **L'héritage de ④** : par règle entière (une ligne = « N jours, HH:MM ») plutôt
  que champ par champ ?
- **Les règles par point × jour** : les éditer à l'écran, ou les retirer ?
- **L'arrêt du plan** : l'aligner sur la limite (il ne la contredit jamais), ou
  l'annoncer dans la boutique ?
- **Le devis** : vérifie-t-il la limite ?
- **Un écran de lecture unique** : pour un produit, un point et un jour, « la
  limite qui s'applique, et pourquoi ».

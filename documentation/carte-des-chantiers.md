# La carte des chantiers

> Ouverte le 2026-10-04 (Hugo : « on a tellement de choses en cours que je ne
> sais pas quoi faire pour terminer des parties »). **Elle se tient à jour à
> chaque lot fini**, et décide de l'ordre. Règle : **un seul lot en cours à la
> fois**, sauf accord explicite de Hugo.

## 1. En production

| Sujet                                               | Lots      | Plan                                                 |
| --------------------------------------------------- | --------- | ---------------------------------------------------- |
| Créneau ou échéance, plusieurs créneaux par adresse | CA3, CA3b | `livraisons/plan-composition-automatique.md` §13–§14 |
| La boîte d'envoi                                    | BE1, BE2  | `journalisation/plan-boite-d-envoi.md`               |
| Clôture, colisage, retrait en faits durables        | E1, E2    | `journalisation/plan-evenements-durables.md`         |
| Le colisage, son domaine (ombre puis bascule)       | K1, K2    | `colisage/plan-domaine-colisage.md`                  |
| Les marges et le compte à rebours                   | V0        | `production/plan-production-par-vagues.md`           |
| Le colisage au premier niveau du rail               | P0        | `colisage/plan-domaine-colisage.md` §9               |

## 2. En cours

| Lot                                                                                   | État                                               | Ce qui reste                |
| ------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------- |
| **K3** — le colisage sert son poste, l'ancien chemin disparaît (« sauvage », §16–§17) | K3a commité et poussé ; K3b commité ; K3c en cours | un déploiement de K3b + K3c |

## 3. L'ordre pour refermer la boucle colisage ↔ livraison

```
clôture ──► colisage (K1/K2 ✅) ──► bacs (K2b ⏳) ──► chargement ──► départ (E3) ──► retrait (E2 ✅)
   └──────────────────────────► livraison « prêt à appliquer » (CA6)
```

1. ~~**K2b** : finir, déployer~~ — déployé le 2026-10-05 (`84de845`).
   1 bis. **K3** (Hugo, « plier le colisage d'une traite ») : K3a, K3b, K3c, un déploiement.
2. ~~**Observer une vraie journée**~~ — retiré le 2026-10-05 (Hugo : « je suis pré-exploitation, ça n'arrivera pas, il faut finir le plan »). Les répétitions en dev et les e2e en tiennent lieu.
3. **E3** : le départ d'une tournée et les commandes rapportées deviennent des
   faits durables (aujourd'hui trois annonces perdables).
4. **CA6** : la livraison écoute la clôture (« prêt à appliquer ») ;
   contredire d'abord le §15 du plan de composition par `vitruve`.
5. **K3** : le poste parle directement au colisage ; l'ancien chemin `legacy`
   disparaît une fois la dernière journée `legacy` terminée.

## 4. Écrit ou décidé, en attente (pas avant la fin du §3)

| Sujet                                                                                                       | Lots                                                            | Bloqué par                            |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------- |
| Suite de K2b : « Proposer » bac par bac et atomique, moitié partagée, retrait partiel, rouvrir une commande | —                                                               | K2b                                   |
| Messages restants                                                                                           | E4 (règlements), E5 (courriels, image), E6 (croissance)         | E3                                    |
| Écran des messages morts (carte de santé)                                                                   | —                                                               | —                                     |
| Composition : capacité, banc à 200, prévisionnel, place suggérée                                            | CA4, banc, CA5, CA7                                             | CA6                                   |
| Production par vagues                                                                                       | V1 (compte par échéance, migration), V2, V3, V4 (marge mesurée) | relecture `vitruve` de la v2 avant V1 |
| Imprimantes thermiques                                                                                      | IM0 (essai), IM1–IM4                                            | achat d'une Zebra                     |
| Tests intermittents des e2e                                                                                 | —                                                               | `todos/todo-flake-des-e2e.md`         |
| Vitesse de la proposition de tournées (marge faible en CI)                                                  | —                                                               | banc à 200                            |

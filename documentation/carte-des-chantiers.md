# La carte des chantiers

> Ouverte le 2026-10-04 (Hugo : « on a tellement de choses en cours que je ne
> sais pas quoi faire pour terminer des parties »). **Elle se tient à jour à
> chaque lot fini**, et décide de l'ordre. Règle : **un seul lot en cours à la
> fois**, sauf accord explicite de Hugo.

## 1. En production

| Sujet                                                                                           | Lots                 | Plan                                                 |
| ----------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------- |
| Créneau ou échéance, plusieurs créneaux par adresse                                             | CA3, CA3b            | `livraisons/plan-composition-automatique.md` §13–§14 |
| La boîte d'envoi                                                                                | BE1, BE2             | `journalisation/plan-boite-d-envoi.md`               |
| Clôture, colisage, retrait en faits durables                                                    | E1, E2               | `journalisation/plan-evenements-durables.md`         |
| Le colisage, son domaine — **bâti** (K3 commité le 2026-10-05, son déploiement non vérifié ici) | K1, K2, K2b, K3a–K3c | `colisage/colisage.md` (les plans sont retirés)      |
| Les marges et le compte à rebours                                                               | V0                   | `production/plan-production-par-vagues.md`           |
| Le colisage au premier niveau du rail                                                           | P0                   | `colisage/colisage.md` §6                            |

## 2. En cours

Aucun lot. **K3 est bâti et commité** (K3a, K3b, K3c — `753f3e4f8`) : le
colisage est le seul poste, l'ancien chemin est retiré. Ce qui reste du
chantier est listé dans [`colisage/colisage.md`](colisage/colisage.md) §9.

## 3. L'ordre pour refermer la boucle colisage ↔ livraison

```
clôture ──► colisage (K1/K2 ✅) ──► bacs (K2b ✅, K3 ✅) ──► chargement ──► départ (E3) ──► retrait (E2 ✅)
   └──────────────────────────► livraison « prêt à appliquer » (CA6)
```

1. ~~**K2b** : finir, déployer~~ — déployé le 2026-10-05 (`84de845`).
   1 bis. ~~**K3** (Hugo, « plier le colisage d'une traite ») : K3a, K3b, K3c, un déploiement~~ — bâti et commité le 2026-10-05 (`753f3e4f8`).
2. ~~**Observer une vraie journée**~~ — retiré le 2026-10-05 (Hugo : « je suis pré-exploitation, ça n'arrivera pas, il faut finir le plan »). Les répétitions en dev et les e2e en tiennent lieu.
3. **E3** : le départ d'une tournée et les commandes rapportées deviennent des
   faits durables (aujourd'hui trois annonces perdables).
4. **CA6** : la livraison écoute la clôture (« prêt à appliquer ») ;
   contredire d'abord le §15 du plan de composition par `vitruve`.
5. ~~**K3** : le poste parle directement au colisage ; l'ancien chemin `legacy`
   disparaît~~ — fait (2026-10-05) ; seules les colonnes mortes restent en
   base (`colisage/colisage.md` §8).

## 4. Écrit ou décidé, en attente (pas avant la fin du §3)

| Sujet                                                            | Lots                                                                                                             | Bloqué par                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Messages restants                                                | E4 (règlements), E5 (courriels, image), E6 (croissance)                                                          | E3                                    |
| Écran des messages morts (carte de santé)                        | —                                                                                                                | —                                     |
| Composition : capacité, banc à 200, prévisionnel, place suggérée | CA4, banc, CA5, CA7                                                                                              | CA6                                   |
| Production par vagues                                            | V1 (compte par échéance, migration), V2, V3, V4 (marge mesurée)                                                  | relecture `vitruve` de la v2 avant V1 |
| Sous-comptes d'un compte pro (`b2b/plan-sous-comptes.md`)        | S1 (lien, suivi daté, verrou), S2 (écrans), S3 (tarif), S4 (facturation), S5 (contacts), S6 (accès du principal) | Hugo : ordre par rapport au §3        |
| Imprimantes thermiques                                           | IM0 (essai), IM1–IM4                                                                                             | achat d'une Zebra                     |
| Tests intermittents des e2e                                      | —                                                                                                                | `todos/todo-flake-des-e2e.md`         |
| Vitesse de la proposition de tournées (marge faible en CI)       | —                                                                                                                | banc à 200                            |

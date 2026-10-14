# Plan de lancement — ouverture commerciale le 20 novembre 2026

> **État : 📐 plan, écrit le 2026-10-14** (jour 90 du développement), à la
> demande de Hugo. **C'est le plan qui pilote jusqu'à l'ouverture** ; il
> succède à [`release-plan-2026-08.md`](release-plan-2026-08.md).
>
> Après l'ouverture : un an de nettoyage et d'amélioration continue (Hugo).
> Ce plan ne couvre que le chemin jusqu'au 20 novembre.

## 1. La thèse

Au rythme actuel, ce n'est pas le code qui manquera : la chaîne existe de bout
en bout (commande → fournil → colisage → chargement → tournée ou transfert →
retrait → facture). Le risque est **d'ouvrir sans avoir vécu une vraie journée
complète**. D'où une seule règle : **gel des fonctionnalités le 6 novembre**,
puis deux semaines où l'on n'éprouve plus que l'existant.

La preuve que l'usage révèle encore des trous : une seule commande pro passée
par Hugo le 2026-10-13 en a sorti six
([`commandes/observations-flux-de-commande.md`](commandes/observations-flux-de-commande.md)).

## 2. Le calendrier

| Période        | Phase                       | Ce qui s'y fait                                                                                                                    | Sortie attendue                                                               |
| -------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 14 oct → 6 nov | **Finir et remplir**        | finir l'en-cours (§3) ; remplir les données réelles (§4)                                                                           | rien de neuf après le 6                                                       |
| 6 → 10 nov     | **Argent, droit, matériel** | argent réel (§6), juridique (§7), matériel et équipe (§8), exploitation (§9) — commencés avant les journées à blanc, finis pendant | un paiement, un remboursement, un prélèvement réels ; une restauration réelle |
| 10 → 17 nov    | **Journées à blanc**        | de vraies journées avec l'équipe, commandes internes, du soir au retrait (§5)                                                      | au moins **une semaine pleine sans bug bloquant**                             |
| 17 → 20 nov    | **Gel**                     | aucune mise en production sauf correctif bloquant                                                                                  | ouverture le 20                                                               |

**Règle du gel** : après le 6 novembre, une mise en production ne porte qu'un
correctif, avec son test de non-régression, sur décision de Hugo. Après le
17, seulement un correctif bloquant.

## 3. Finir l'en-cours (jusqu'au 6 novembre)

| Chantier                                                         | État au 2026-10-14    | Doc                                                                                                      |
| ---------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| Heure limite désactivable, arrêt du plan = limite (O3, ferme O5) | en construction       | [`commandes/plan-reglages-commandes.md`](commandes/plan-reglages-commandes.md) §8                        |
| Créneau obligatoire, aucune commande sans créneau                | à lancer après O3     | —                                                                                                        |
| Page Commandes : colonne Mode, heures                            | bâti, à vérifier      | [`commandes/plan-tri-depart-et-couleurs.md`](commandes/plan-tri-depart-et-couleurs.md)                   |
| Véhicule sans plaque, avertissements                             | bâti, à commiter      | —                                                                                                        |
| Démo à la norme (sites, couleurs, Transit City)                  | en construction       | —                                                                                                        |
| Jours livrables servis par le serveur (avec l'heure limite)      | proposé, non décidé   | [`commandes/observations-flux-de-commande.md`](commandes/observations-flux-de-commande.md) O1/O2         |
| **Réapprovisionnement d'un site**                                | plan, Q-R1 à trancher | [`livraisons/transferts/plan-reapprovisionnement.md`](livraisons/transferts/plan-reapprovisionnement.md) |
| Tri par heure de départ (L2)                                     | plan                  | [`commandes/plan-tri-depart-et-couleurs.md`](commandes/plan-tri-depart-et-couleurs.md)                   |

**Décision à prendre maintenant (Q-L1)** : le réapprovisionnement est le seul
chantier de taille encore ouvert. **S'il n'est pas bâti et éprouvé le
6 novembre, le Village ouvre avec ses seuls retraits par transfert**, et le
réapprovisionnement suit après l'ouverture.

## 4. Les données réelles (jusqu'au 6 novembre)

- [ ] **Catalogue** : fiches remplies et publiées, allergènes complets, visuels.
- [ ] **Sites** : Labo renommé Adroit ; GPS des deux sites ; Val Village
      approvisionné par transfert ; couleurs ; temps de mise en place au comptoir ;
      créneaux publics ; réduction de retrait.
- [ ] **Commandes** : heure limite (ou désactivée), annulation, ouverture.
- [ ] **Livraison** : zones et frais, jours, créneaux ; véhicules mesurés
      (Transit City : cotes utiles **et passages de roue**, à mesurer sur place).
- [ ] **Comptes pros** : sociétés, conditions de règlement, mandats.
- [ ] **Droits** : chaque rôle réglé à l'écran (`/admin/staff-roles`), dont
      les six ressources neuves du 2026-10-13.

## 5. Les journées à blanc (10 → 17 novembre)

Chaque journée se joue **en vrai**, avec l'équipe à ses postes, des commandes
passées par la boutique (pro et particulier, retrait et livraison, Labo et
Village) :

1. la veille : commandes, heure limite, arrêt du plan ;
2. le matin : fournée, colisage (cadres de couleur, transfert), chargement
   (bacs, bacs du transfert), départ ;
3. la tournée : « Ma tournée », la porte, « Remis au site » ;
4. le comptoir : réception du transfert au Village, retraits, refus attendus ;
5. le soir : annulations, relances, ce que la facturation verra.

Chaque écart va au carnet des observations, avec son sort. **Critère de
sortie** : une semaine pleine sans observation bloquante.

## 6. L'argent en réel (6 → 17 novembre)

> **Au 2026-10-14** : la banque n'a répondu à **aucune** de nos 31 questions
> sur le prélèvement
> ([`comptabilite/prelevement/question-banque-v2.md`](comptabilite/prelevement/question-banque-v2.md)) —
> le prélèvement réel dépend de ses réponses, et c'est le **risque principal**
> de cette section. Pour les particuliers, le seul moyen de paiement est
> **Stripe**, à **1,25 % + 0,25 € par transaction**.

- [ ] Stripe en mode **réel** : un paiement carte, puis son remboursement.
- [ ] Un **prélèvement SEPA** réel sur un compte de l'équipe.
- [ ] Une **facture mensuelle** émise et relue.
- [ ] La relance de règlement (son comportement si l'heure limite est
      désactivée est encore à trancher — O3 §8.1).

## 7. Le juridique (6 → 17 novembre)

- [ ] CGV et mentions légales relues.
- [ ] Texte d'information RGPD du livreur, à jour du registre
      ([`legal/rgpd-registre.json`](legal/rgpd-registre.json)).
- [ ] Durées de conservation encore « non décidées » : décidées.

## 8. Le matériel et l'équipe (6 → 10 novembre)

- [ ] Imprimantes : étiquettes de bac, feuilles de route, bons — la couleur
      s'imprime-t-elle ?
- [ ] Téléphones des livreurs ; scan des QR au comptoir.
- [ ] Une formation courte par poste (fournil, colisage, chargement, tournée,
      comptoir).

## 9. Sécurité et exploitation (6 → 17 novembre)

- [ ] Revue de sécurité ciblée : droits, mur entre clients, paiements.
- [ ] Une sauvegarde de la base **réellement restaurée** une fois.
- [ ] Qui est alerté si l'application tombe à 5 h du matin, et comment.

## 10. Questions à Hugo

- ~~**Q-L1**~~ — ✅ (Hugo, 2026-10-14) : **avant l'ouverture** — le
  réapprovisionnement se bâtit à partir du 2026-10-15. Reste à trancher avant
  de bâtir : Q-R1 (agrégat à part, recommandé) et l'heure limite qui
  s'applique (celle des pros, proposée).
- ~~**Q-L2**~~ — ✅ (Hugo, 2026-10-14) : journées à blanc **à partir du
  10 novembre**. Reste : qui à chaque poste.
- ~~**Q-L3**~~ — ✅ (Hugo, 2026-10-14) : revue de sécurité **en interne**.

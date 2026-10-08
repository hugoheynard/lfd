# TODO — les rejets bancaires d'un prélèvement

**Ouvert le 2026-10-05**, après le lot de prélèvement figé
([`plan-lot-de-prelevement-fige.md`](plan-lot-de-prelevement-fige.md)).

## Le fait

Un lot déposé passe ses commandes à `collected` au clic « Marquer déposé ».
C'est une promesse, pas un encaissement : la banque peut **rejeter** un
débit plusieurs jours plus tard (provision insuffisante, compte clos, mandat
contesté ou révoqué chez le débiteur, opposition). Le débiteur peut aussi
**contester** un débit CORE jusqu'à 8 semaines après, et 13 mois s'il n'y
avait pas d'autorisation. Aujourd'hui, rien ne revient dans le système : une
commande rejetée reste `collected`, et on la croit payée.

## Ce qu'il faudrait

1. **Recevoir le retour** : saisie manuelle d'un rejet depuis l'écran des lots
   (le plus simple au démarrage), puis lecture du fichier de retour de la
   banque (`pain.002` pour les rejets avant règlement, `camt.054` pour les
   retours après) quand la banque le fournit.
2. **Retrouver ce qui est touché** : un rejet porte l'`EndToEndId` de la
   ligne. Le lot figé garde, pour chaque ligne, ses commandes
   (`collection_batch_line` → `order_collection`) : c'est ce qui permet de
   remonter à elles.
3. **Changer leur état** : les commandes de la ligne passent `rejected`, avec
   le motif bancaire (code `R` du rejet), la date et le lot d'origine. Elles
   **ne reviennent pas d'elles-mêmes** au lot suivant : un prélèvement rejeté
   pour un compte vide ne se re-présente pas à l'aveugle.
4. **Décider la suite**, geste staff : re-présenter au prochain lot, régler
   par lien de paiement, ou passer en recouvrement. Sur un mandat révoqué,
   seule une nouvelle signature permet de re-présenter.
5. **Le dire** : le rejet apparaît sur la fiche client, dans le relevé de
   cycle, et déclenche une alerte de compte. Les frais de rejet facturés par
   la banque se notent sur le lot.

## Questions ouvertes

- **La banque (Caisse d'Épargne) fournit-elle des fichiers de retour**, et
  sous quel format ? Même entretien que les autres questions de
  [`prelevement-sepa.md`](prelevement-sepa.md).
- **Un rejet suspend-il le client** (plus de commande au compte) jusqu'à
  régularisation ? Ou seulement une alerte ?
- **Les frais de rejet** sont-ils refacturés au client ?
- **Une contestation après 8 semaines** (débit non autorisé) : quel
  traitement comptable ? À voir avec le cabinet.

## Dépend de

- Le lot de prélèvement figé (S4-0), **bâti le 2026-10-05** : il donne
  `order_collection` et le lien ligne → commandes.

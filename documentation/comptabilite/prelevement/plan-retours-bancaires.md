# Plan — les retours bancaires d'un prélèvement (PA5)

> 📐 **Plan v2, 2026-10-09** (v1 contredite par `vitruve` : trois BLOQUANTS ; le § 2 bis prime sur les §§ 2 à 7), écrit en l'absence d'Hugo. Remplace, une fois
> bâti, [`todo-rejets-bancaires.md`](todo-rejets-bancaires.md). Touche
> **l'argent** : contredit par `vitruve` avant d'être bâti (§ 8). Arbitrages
> dans [`../arbitrages-en-absence.md`](../arbitrages-en-absence.md).

## 1. Ce qui existe (à vérifier par `vitruve`)

- « Marquer déposé » (`CollectionBatch.markDeposited`) passe les commandes du
  lot à `collected` : une promesse, pas un encaissement.
- Depuis E4, une **ligne de lot encaisse des factures émises**
  (`collection_batch_line_invoice`) ; avant, un **arrêté**
  (`billing_statement`). Chaque ligne a son `EndToEndId` unique.
- Rien ne revient de la banque : une ligne rejetée reste « prélevée ».
- Le format des fichiers de retour de la Caisse d'Épargne n'est pas connu
  ([`question-banque.md`](question-banque.md)).

## 2. La règle

**Un retour bancaire porte sur une ligne de lot, jamais sur une partie.** Il
défait l'encaissement de **toute** la ligne : ses factures (ou son arrêté)
redeviennent **dues**, ses commandes quittent `collected`. Rien ne repart
tout seul au lot suivant : un humain décide.

| Retour                       | Quand                                   | Exemples de motifs ISO 20022                                                 |
| ---------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| **Rejet** (avant règlement)  | avant ou à l'échéance                   | AC01 IBAN faux, AC04 compte clos, MD01 pas de mandat, MS02 refus du débiteur |
| **Retour** (après règlement) | jusqu'à 5 jours ouvrés après            | AM04 provision insuffisante                                                  |
| **Contestation** (CORE)      | jusqu'à 8 semaines, 13 mois sans mandat | MD06 remboursement demandé, MD01                                             |

## 2 bis. Ce que la v2 change (prime sur les §§ 2 à 7)

1. **L'état vit sur `order_collection`**, à la maille de la commande (la
   facture et l'arrêté n'ont pas d'état d'encaissement). Deux valeurs neuves :
   **`returned`** (garde son lien à la ligne rejetée ; **hors** des états
   ouverts, donc jamais repris par la constitution ni l'automatisme) et
   **`written_off`**. Le CHECK `order_collection_in_a_line` est remplacé par
   un CHECK qui admet `returned` avec sa ligne (nouvelle migration, l'ancienne
   intacte). Transitions dans `OrderCollection` : `collected → returned`,
   `returned → due` (re-présenter : perd le lien, le retour garde la trace),
   `returned → settled_otherwise`, `returned → written_off`.
2. **Re-présenter n'est permis que pour une ligne qui encaissait des factures
   (E4).** Une ligne sous arrêté, ou d'avant F3, ne se re-présente pas (elle
   serait refacturée) : seuls « régler autrement » et « passer en perte ».
3. **Un retour par transaction, par `end_to_end_id`** (unique, la clé
   d'appariement de R5b), qui désigne la ligne.
4. **ISO** : `pain.002` = rejets avant règlement (`ExternalStatusReason1Code`) ;
   `camt.054` = retours et remboursements après règlement
   (`ExternalReturnReason1Code`), montant comparé sur `TxAmt`. **Un lot B2B
   refuse `refund_request`** (pas de remboursement en interentreprises).
   Montant du retour = montant de la ligne, **règle** de l'agrégat ; les
   frais sont à part (`fee_cents`).
5. **Le mandat gagne** : re-présenter est refusé si le mandat n'est plus
   actif (`debitable()`), et pour un mandat **ponctuel** déjà consommé (il
   faut un lien de paiement). Un motif qui appelle une révocation (MD01,
   AC04…) **propose** au staff de révoquer par le geste existant ; rien n'est
   révoqué tout seul.
6. **La re-présentation suit le lot suivant normal** : son avis respecte le
   préavis (D4) et dit « nouvelle présentation du prélèvement rejeté du … ».
7. **Faits** : `collection.returned` et `collection.return_resolved`
   (`represented` | `settled_otherwise` | `written_off`), jamais d'IBAN.
8. **Droit** : saisir, résoudre, passer en perte sous **`b2b_accounting:write`**
   (une ressource neuve s'accorderait à l'écran ; arbitré en ton absence).
   Le retour s'affiche sur la fiche du **payeur** (`debtor_company_id`).
9. **Passer en perte** ne produit aucune écriture comptable ni avoir : un
   état et un fait, en attendant le cabinet.

## 3. Le modèle

Table `collection_return` : `id`, `batch_line_id`, `kind` (`reject` |
`return` | `refund_request`), `reason_code` (4 lettres, liste ISO fermée
dans le domaine, « autre » admis avec un libellé), `returned_on` (date
banque), `amount_cents` (= montant de la ligne, vérifié), `fee_cents`
(frais de la banque, facultatif), `source` (`manual` | `pain002` |
`camt054`), `recorded_at`, `recorded_by`, `resolution` (`pending` |
`represented` | `settled_otherwise` | `written_off`), `resolved_at/by`.

- **Un seul retour par ligne** (unique `batch_line_id`) : un débit rejeté
  n'est pas rejeté deux fois.
- Seule une ligne d'un lot **déposé** peut recevoir un retour.
- Les factures de la ligne gagnent un état d'encaissement lisible
  (« prélevée », « rejetée le … ») ; la facture elle-même ne change pas
  (immuable) : elle reste due tant qu'un encaissement ne la solde pas.

## 4. La suite, geste staff

- **Re-présenter** : la ligne rejetée redevient éligible au **prochain lot**
  (ses factures y entrent) ; refusé si le mandat est révoqué (motif MD01,
  MS02 ou mandat non actif) — il faut une nouvelle signature.
- **Régler autrement** : un lien de paiement (existant) ou un virement noté.
- **Passer en perte** : `written_off`, avec motif ; à voir avec le cabinet.

## 5. Le dire

- Cloche staff et fait au journal (`collection.returned`, motif, montant ;
  jamais l'IBAN).
- Fiche client : « Prélèvement rejeté le … (motif) ».
- **Pas de blocage automatique** du client (arbitrage) : le staff peut
  bloquer par l'outil existant.
- Les frais de rejet se notent sur le retour ; **pas refacturés** au client
  (arbitrage, à confirmer avec tes CGV).

## 6. Les entrées

- **R5a — saisie manuelle** depuis l'écran du lot : ligne, type, motif,
  date, frais. Tout de suite utilisable, quel que soit le format de la
  banque.
- **R5b — lecture de fichier** `pain.002` / `camt.054` (ISO 20022, versions
  courantes) : import qui **propose** des retours appariés par `EndToEndId`,
  que le staff confirme. Bâti sur la norme ; à éprouver sur un vrai fichier
  de la Caisse d'Épargne.

## 7. Questions — arbitrées en l'absence d'Hugo

- Un rejet suspend-il le client ? **Non**, alerte seulement.
- Les frais de rejet refacturés ? **Non**.
- Re-présentation automatique ? **Non**, geste staff.
- Contestation après 8 semaines (13 mois) : même saisie, motif MD01 ; le
  traitement comptable reste à voir avec le cabinet.

## 8. Contradiction (`vitruve`)

v1 contredite le 2026-10-09. **BLOQUANTS, corrigés** : la commande rejetée
serait repartie seule au lot suivant (§ 2 bis-1) ; une ligne sous arrêté
aurait été refacturée (2) ; unicité sans mécanisme (3). **SÉRIEUX,
corrigés** : sémantique ISO et B2B (4) ; mandat ponctuel consommé et
révocation (5) ; préavis de la re-présentation (6) ; faits de résolution
(7) ; droits et fiche (8) ; perte (9).

## 9. Lots

| Lot     | Contenu                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------- |
| **R5a** | `collection_return`, saisie manuelle, effets sur la ligne / factures / commandes, suite, journal, écrans |
| **R5b** | import `pain.002` / `camt.054`, appariement par `EndToEndId`, confirmation staff                         |

# Notre réassort comparé aux systèmes du marché

Comparé à : [README.md](README.md) (l'état de notre réassort) et
[reste-a-faire.md](reste-a-faire.md).

> 📝 **Étude du 2026-11-02** (demande de Hugo : « si tu devais comparer notre
> système de réappro à des systèmes existants haut de gamme », puis
> « documente les différences et inspirations des features concurrentes »).
> Notre côté : les docs d'état du dossier, réécrites le même jour après lecture
> du code. Côté marché : **de mémoire, non vérifié auprès des éditeurs** — les
> descriptions donnent la catégorie de fonction, pas un comportement exact ni
> un prix. Aucune source n'a été ouverte ; avant d'acheter ou de copier une
> fonction, vérifier chez l'éditeur.

Légende de la colonne « nous » : ✅ bâti, 🟡 partiel, ❌ absent.

---

## 1. Les familles de systèmes

| Famille                                    | Exemples                                                 | Ce qu'ils font d'abord                                                                                     |
| ------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Réassort du frais, piloté par la prévision | RELEX Solutions, Blue Yonder (ex-JDA)                    | prévoir la demande par magasin et par jour, proposer ou passer la commande, arbitrer gâchis contre rupture |
| Modules de réassort d'un ERP de commerce   | SAP (S/4HANA Retail), Oracle Retail                      | seuils min/max, stock de sécurité, commandes automatiques vers l'entrepôt ou le fournisseur                |
| Caisses et back-offices de restauration    | Zelty, Lightspeed, Tiller, Innovorder (caisses ouvertes) | les ventes au ticket en temps réel, par API ; parfois un stock théorique déduit des ventes                 |
| Notre caisse actuelle                      | Pi Electronique                                          | encaissement certifié NF 525 ; **système fermé** (Hugo, 2026-11-02)                                        |

Notre réassort ne ressemble à aucune famille seule : il relie la **boutique au
fournil**, là où les grands relient un magasin à un entrepôt ou à un
fournisseur, et la production y est un autre logiciel.

---

## 2. Fonction par fonction

| Fonction                                      | Marché (de mémoire)                                                                                    | Nous                                                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demande du magasin                            | proposée par le calcul, validée ou non par un humain                                                   | ✅ saisie par le comptoir ou le fournil, brouillons au serveur ([commander.md](commander.md)) ; **aucune proposition**                                                       |
| Prévision de la demande                       | historique, jour de semaine, fêtes, météo, promotions ; apprentissage automatique                      | ❌                                                                                                                                                                           |
| Ventes réelles en boutique                    | lues à la caisse, souvent en continu                                                                   | ❌ la caisse Pi Electronique est fermée ; le stock du jour vaut « reçu − commandes sur stock » ([reception-et-stock.md](reception-et-stock.md)), il **surestime** la vitrine |
| Invendus, perte en fin de journée             | saisis ou déduits ; nourrissent la prévision                                                           | ❌                                                                                                                                                                           |
| Arbitrage gâchis / rupture du frais           | cœur du métier chez les spécialistes du frais : quantité optimisée selon le coût de l'un et de l'autre | ❌                                                                                                                                                                           |
| Seuils qui agissent (min, stock de sécurité)  | un seuil déclenche une proposition ou une commande                                                     | 🟡 alertes de rupture et de stock faible calculées, **sans effet** ([reste-a-faire.md](reste-a-faire.md))                                                                    |
| Lien avec la production                       | rare : la production est un autre système, raccordé par interface                                      | ✅ la demande entre au plan figé, au dossier du jour, au colisage ([au-plan-du-fournil.md](au-plan-du-fournil.md))                                                           |
| Réassort dans la journée                      | surtout des livraisons planifiées ; l'urgence passe par un humain                                      | ✅ « au plus tôt » : réserve du colisage, transport, suivi ([au-plus-tot.md](au-plus-tot.md))                                                                                |
| Traçabilité au geste                          | expédition et réception avec écarts                                                                    | ✅ demandé, produit, emballé, parti, arrivé, reçu                                                                                                                            |
| Pièce et poids                                | gérés, parfois par conversion                                                                          | ✅ deux unités jamais additionnées, grammes entiers ([vente-au-poids.md](../pricing/vente-au-poids.md))                                                                      |
| Stock magasin vendu en ligne le jour même     | « click & collect sur stock magasin », souvent sans réservation réelle                                 | ✅ sous verrou, avec expiration du paiement abandonné ([jour-meme-sur-stock.md](../limites-de-commande/jour-meme-sur-stock.md))                                              |
| Réassort récurrent (même demande chaque jour) | courant (gabarits, commandes permanentes)                                                              | ❌ décidé « plus tard » ([reste-a-faire.md](reste-a-faire.md))                                                                                                               |
| Tableaux de bord (taux de rupture, de perte)  | standard                                                                                               | ❌ sans ventes ni invendus, rien à mesurer                                                                                                                                   |

---

## 3. Ce qu'on peut en tirer, dans l'ordre

Chaque inspiration dit **ce qu'elle demande** : la plupart ne dépendent que de
nous, une seule dépend de la caisse.

1. **Saisir les invendus en fin de journée** au comptoir, par article et par
   unité. Ne dépend que de nous. Donne la vraie consommation, même sans la
   caisse : reçu − invendus − commandes sur stock = vendu en boutique.
2. **Un point d'entrée pour les ventes de la caisse**, indifférent à la voie :
   fichier importé (le « Z » de clôture), flux d'export, ou API. Ne dépend que
   de nous ; sa source dépend de Pi Electronique (§ 4).
3. **Proposer la quantité de réassort**, d'abord comme suggestion que l'humain
   valide : moyenne des mêmes jours de semaine, corrigée des invendus. C'est la
   version simple de ce que font les spécialistes du frais, sans apprentissage
   automatique.
4. **Faire agir les seuils** : une rupture ou un stock faible propose un
   réassort « au plus tôt », que le fournil accepte ou non. Ne dépend que de
   nous ; déjà au [reste à faire](reste-a-faire.md).
5. **Réassort récurrent** : une demande type par jour de semaine, reprise et
   ajustée. Déjà décidé « plus tard ».
6. **Mesurer** le taux de rupture et le taux de perte par article, quand 1 et 2
   existent.

---

## 4. La caisse : quatre voies (Pi Electronique, système fermé)

| Voie                                | Temps réel | Ce que ça demande                                                                                                       |
| ----------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| Export ou API de l'éditeur          | selon eux  | leur accord ; une caisse NF 525 tient un journal exportable, au moins pour le comptable                                 |
| Le « Z » de clôture importé le soir | non        | un export de fin de journée ; suffit pour la prévision (ventes par article et par jour)                                 |
| Recopie du flux vers l'imprimante   | oui        | un boîtier intercalé et le décodage de leur format ; fragile ; compatibilité avec la certification à confirmer avec eux |
| Caisse ouverte (à terme)            | oui        | changer de caisse pour une caisse NF 525 à API (catégorie du § 1) ; un vrai projet                                      |

Questions à poser à l'éditeur : existe-t-il une API ou un export automatique
des tickets ligne par ligne avec le code article ; à quelle fréquence ; en quel
format et par quel canal ; les articles de caisse peuvent-ils porter nos SKU.

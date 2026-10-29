# Plan — changer l'unité de vente d'une déclinaison déjà publiée

> 📐 **Doc-first**, écrit le 2026-10-29. Hugo, devant le refus « Déjà publiée :
> l'unité ne change plus » : « pour la vente au poids, non, j'ai besoin de
> changer », puis « fais la version propre ». Touche à l'argent : `vitruve`
> avant de bâtir.

## 1. Ce qui existe (ouvert le 2026-10-29)

- Le verrou est au **domaine** : `Variant.changeSaleTerms`
  (`apps/lfd-api/src/pim/catalogue/product/domain/entities/variant.ts:680-682`)
  lève `SaleUnitFrozenError` dès qu'une déclinaison a été publiée
  (`publishedFlag`, `has_been_published`). L'écran le reflète
  (`store.saleUnitLocked()`, `pricing-form.html:22-27`).
- Sa raison (`sale-unit-errors.ts:14-19`, `vente-au-poids.md` §2, §4.2) : « des
  lignes de commande, des factures et des historiques la lisent déjà, et le
  référentiel ne peut pas savoir lesquels ».
- Ce qui est **déjà figé par ligne**, donc sans risque : l'unité d'une ligne de
  commande (`order_lines.sale_unit`, figée à la passation comme son prix), le
  bon de livraison (`delivery_note_line.sale_unit`), la facture
  (`FrozenInvoiceLine.saleUnit`), le fournil (`production_count`,
  `MixedSaleUnitCountError` refuse déjà d'additionner les deux unités).

## 2. Ce qui changerait de sens en silence

| Où                                      | Le risque                                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Commandes **en cours** (non remises)    | la ligne garde son unité ; mais le fournil du jour mêlerait pièces et grammes sous un même SKU (refus `MixedSaleUnitCountError`, donc une journée qui casse) |
| Paniers ouverts (serveur et navigateur) | « 3 » pièces deviendraient 3 g                                                                                                                               |
| Décisions tarifaires sur ce SKU         | une mercuriale « 2,10 € » la pièce deviendrait 2,10 € le kilo ; idem plancher, palier, promotion ; un engagement de volume compterait des grammes            |
| Quantité minimale                       | un minimum en pièces sur un article au poids (déjà refusé au domaine : `MinQuantityOnWeightSaleError`)                                                       |
| Prix au kilo informatif                 | n'a plus de sens au poids (le prix servi EST au kilo)                                                                                                        |

## 3. La règle proposée

Le changement d'unité d'une déclinaison publiée est **accepté**, sauf deux
refus qui nomment le cas et le geste de sortie :

1. **Commandes en cours** : refusé tant qu'une commande non clôturée (pas encore
   remise, ni annulée) porte ce SKU — le refus donne le nombre et la date du
   dernier jour de service concerné. Geste : attendre, ou modifier ces
   commandes.
2. **Décisions tarifaires** : refusé tant qu'une décision EN VIGUEUR vise ce
   SKU (mercuriale, plancher, palier, promotion, engagement) — le refus les
   liste. Geste : les clore, puis les reposer dans la nouvelle unité. Aucune
   conversion automatique : un prix à la pièce n'a pas d'équivalent au kilo.

Accepté, le geste :

- remet à zéro le minimum (déjà le cas : `carried = PIECE_SALE_TERMS`), et
  retire la quantité minimale en pièces si l'on passe au poids ;
- émet le fait catalogue comme tout changement de tarif ; le commerce reçoit la
  nouvelle unité ;
- **les paniers** : une ligne d'un panier dont l'unité ne correspond plus est
  retirée au prochain devis, avec un message au client (« L'article X se vend
  désormais au poids : ajoutez-le de nouveau ») — jamais convertie.
- journal : `variant.sale_unit_changed` (avant / après), lisible au journal
  du référentiel.

## 4. La frontière

Le référentiel ne lit pas le commerce (`pim → b2b` interdit). Il **déclare** un
port dans son canal, `pim/channels/b2b-platform/` — `SaleUnitChangeBlockers`,
« qu'est-ce qui empêche de changer l'unité de ce SKU ? » — et le **commerce
l'implémente** (commandes en cours, décisions en vigueur) ; `appBootstrap` les
relie. C'est la forme normale de `production/channels/commerce/`. Le port
répond par une liste typée de blocages ; le domaine lève l'erreur qui les nomme.

## 5. Les lots

- **U1 (backend)** : le port et son implémentation commerce ; `changeSaleTerms`
  ne lève plus `SaleUnitFrozenError` mais reçoit les blocages (ou le handler
  les lit et les passe au domaine) ; nouveau refus nommé ; fait de journal ;
  le panier qui retire la ligne au devis ; tests (domaine, handler, e2e : un
  changement accepté, un refusé pour commande en cours, un refusé pour
  mercuriale, un panier dont la ligne tombe).
- **U2 (back-office)** : le sélecteur d'unité redevient actif ; le refus
  s'affiche dans la carte avec sa liste ; la phrase « Déjà publiée : l'unité ne
  change plus » disparaît.
- **U3 (boutique)** : le message du panier pour une ligne retirée.
- **docs** : `vente-au-poids.md` (la règle « figée à la première publication »
  devient « refusée tant que… »).

## 6. Ce qui n'est pas vérifié

- Comment le commerce sait qu'une commande est « en cours » pour un SKU (le
  statut exact et la requête).
- Si le panier serveur et le panier du navigateur portent l'unité de la ligne.
- Si d'autres décisions visent un SKU (modèles de prix, abonnements, lots) et
  doivent aussi bloquer.

## 7. Contradiction (vitruve, 2026-10-29) — la règle du § 3 ne tient pas

**BLOQUANTS**

1. **La facture du mois casse** : `assertOneUnit`
   (`b2b/accounting/domain/services/invoice-lines.ts:98-110`) refuse un dossier
   où un même SKU apparaît à la pièce et au poids — les commandes REMISES y
   restent. La facture est figée par ligne, pas par dossier (§ 1 faux).
2. **Les décisions larges changent le prix en silence** : `coversManyArticles`
   (`specificity.ts:146`) n'applique règles, barèmes et planchers globaux ou de
   famille qu'à la pièce — passer au poids retire toutes les remises larges,
   sans qu'aucune décision ne soit prise.
3. **La course entre les deux blocs** : une commande passée entre la lecture du
   port et l'arrivée du miroir, puis d'autres au poids le même jour →
   `MixedSaleUnitCountError` (500) à la clôture du fournil ; idem colisage
   (`MixedSaleUnitLineError`). « Pas de commande ouverte à l'instant T » ne
   suffit pas : il faut une borne par jour de service ou un effet à J+1.
4. **Les abonnements actifs** deviennent des commandes impossibles
   (`SaleUnitMismatchError` à chaque passation) : troisième refus nécessaire.

**SÉRIEUX** : réassort, lots (`BundleChoice`), modèles de prix
(`PriceTemplate.lines`), engagements signés à la pièce ; décisions CLOSES et
historique des prix sans colonne d'unité (une mercuriale close à 2,10 € la
pièce relue comme 2,10 € le kilo — le passé se réécrit) ; `ProductNorm` et
alertes de quantité qui mêlent pièces et grammes ; le panier navigateur
recalcule l'unité depuis le catalogue courant (« 3 pièces → 3 g », exactement
ce qu'on voulait éviter) ; `OrderDraft` oublié ; le statut « en cours » est
`draft … partially_handed_over` ; le port n'a pas de précédent dans ce sens et
doit refuser si le commerce ne répond pas.

**Conclusion** : changer l'unité d'un article DÉJÀ VENDU demande de dater
l'unité partout (décisions, historique, facturation) — un chantier lourd et
irréversible. Voir la proposition du § 8.

## 8. Proposition révisée (à confirmer par Hugo)

**Le verrou ne porte plus sur « publié », mais sur « déjà utilisé ».**
L'unité d'une déclinaison change librement **tant qu'aucune commande (même
annulée ou brouillon), aucun abonnement, aucun réassort, aucun lot, aucun
modèle de prix et aucune décision tarifaire (en vigueur ou close) ne porte son
SKU**. Dès la première utilisation, le geste de sortie reste « une autre
déclinaison ».

Ce qui en découle : aucune facture, aucun compte du fournil, aucun historique
de décision ne peut contenir deux unités pour un SKU — les quatre BLOQUANTS
tombent, faute de passé à réécrire. Restent : la course (une première commande
pendant le geste — refuser au commerce une commande dont l'unité diffère de
celle du miroir, ce que `ensureSaleQuantity` fait déjà) et les paniers (ligne
retirée au devis, jamais convertie).

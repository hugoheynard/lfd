# La fiche d'atelier — plan

> Dossier de reprise : `handoff-fiche-atelier/` (SPEC.md, maquette trois vues).
> Écrit le 2026-09-13, avant la première ligne.

**Ce qu'on livre** : une fiche par catégorie, sur **deux supports** — poste fixe
et téléphone. Pas de feuille A4 : les bons de commande existants tiennent déjà
le papier, et on ne leur touche pas.

---

## 1. Ce que le handoff ne pouvait pas savoir

Trois faits relevés dans le dépôt, chacun vérifié en ouvrant le fichier. Ils
changent la conception, pas l'écran.

### 1.1 Le compte à produire EXISTE déjà, et c'est la fiche

`production.ProductionCount` — « un article, une quantité, tous clients
confondus » — est exactement la liste que la fiche affiche. Le handoff proposait
`GET /admin/production/worksheet` qui referait un `groupBy` sur le récap du
commerce : ce serait une **seconde** agrégation du même fait, avec l'occasion de
diverger de la première.

Conséquence : la fiche se sert du bloc `production`, pas de `b2b/orders`.

### 1.2 L'heure de tirage existe déjà — c'est `closedAt`

SPEC §6 dit que « l'heure de tirage manque partout ». C'est vrai des deux
documents qu'elle cite, et faux du compte à produire : `ProductionDay.closedAt`
EST l'instant où le tirage a été arrêté, et `AtelierSheet.issuedAt` porte déjà
celui de chaque feuille.

Il n'y a donc rien à inventer : il y a une heure à **afficher**.

### 1.3 🔴 Personne ne clôt jamais une journée

`POST /admin/production/batch/:date/close` n'a **aucun appelant** hors des
e2e — ni dans l'admin, ni dans la boutique (vérifié le 2026-09-13 : le seul
`grep` qui remonte hors `src/production` est `test/`). Le compte à produire est
donc vide en exploitation, et le resterait sous la fiche.

C'est le fait le plus lourd du lot, et il commande deux choses :

- la fiche **arbitre deux sources**, exactement comme le prévisionnel le fait
  déjà (« le compte arrêté l'emporte, la demande du commerce sinon ») ;
- l'écran porte le geste qui manque — **arrêter le plan** — sans quoi aucune
  fiche n'aura jamais d'heure de tirage.

---

## 2. L'arbitrage, et d'où sort le bandeau

| La journée est… | Les lignes viennent de                  | `generatedAt` | Bandeau              |
| --------------- | --------------------------------------- | ------------- | -------------------- |
| **arrêtée**     | `ProductionCount` (l'instantané)        | `closedAt`    | l'écart, s'il y en a |
| **ouverte**     | `ExpectedProductionReader` (la demande) | `null`        | aucun                |

Le bandeau se lit sur **`DayOrdersReader.producibleFor(jour)`**, dont on retire
les commandes que la journée porte déjà (par `orderId`). Ce qui reste est
exactement ce qui est arrivé depuis le tirage : son compte donne les « 14
commandes arrivées depuis », ses lignes le `+18`, et le recoupement par SKU les
lignes nommées (`seigle 30 → 42`).

⚠️ **Le filtre par `orderId` n'est pas un détail de confort.** Le port ne rend
que les commandes `placed`, et la clôture les fait passer à `confirmed` — mais
par un **événement en processus, ni persisté ni rejoué**. Un abonné qui échoue
laisse donc des commandes `placed` **déjà inscrites au plan** (c'est
`pendingInCommerce`). Sans le filtre, la fiche annoncerait un écart qui n'existe
pas et compterait deux fois des pièces déjà au compte.

Le filtre a une seconde vertu : le bandeau annonce alors **exactement** ce que
le bouton absorbera, puisque le retirage écarte les mêmes `orderId`. Le chiffre
affiché et le geste proposé ne peuvent plus diverger.

Une journée ouverte n'a rien d'arrêté : elle ne peut pas être périmée, et
l'écran dit « plan non arrêté » plutôt que d'inventer une heure.

## 3. Le retirage — et l'invariant qu'il touche

L'agrégat dit aujourd'hui : **une journée arrêtée ne se recalcule pas**, parce
que le refaire donnerait un autre nombre que celui sur lequel le fournil a lancé
ses fournées.

La maquette demande pourtant « Retirer la fiche de 6 h 20 ». Ce n'est pas la
même chose, et c'est toute la différence : un **recalcul silencieux** contre un
**geste attesté**, fait par quelqu'un à qui l'on vient de montrer les deux
lignes qui changent et de dire laquelle est déjà cochée.

`ProductionDay.retake(orders, at, by)` :

- refuse sur une journée non arrêtée ;
- absorbe les commandes que la journée ne porte pas encore (par `orderId`) ;
- recalcule le compte, **en gardant les coches par SKU** ;
- écrit `retakenAt` / `retakenBy` — la fiche dit alors quel tirage elle montre.

L'invariant n'est pas levé : il est **nommé**. Le recalcul reste impossible par
accident ; il devient possible par décision, et laisse une trace.

## 4. Les coches

Un fait du FOURNIL, comme le colisage — même famille que `pack()`, et même
règle : l'instant et son auteur ensemble, jamais deux champs nullables qui
peuvent se contredire.

```
DoneMark { at, by, initials }   // sur ProducedItemSnapshot
```

Trois refus : journée non arrêtée (rien à cocher), SKU absent du compte,
initiales hors format. **Décocher est autorisé** — contrairement au colisage :
une case cochée par erreur à 4 h du matin doit pouvoir se reprendre, et le
refuser transformerait un doigt fariné en incident.

## 5. Le contenant

`containerLabel` est du **paramétrage fournil**, et il vit dans le bloc
`production` — pas dans le PIM. « Combien de baguettes tiennent sur une
tourneuse » est un fait du four, pas une propriété de vente ; le PIM a bien des
`ProductPackaging`, mais ce sont des unités de VENTE en volume, et les confondre
mettrait un conditionnement client sur une feuille de fournil.

Table `production_container` : `sku`, `unitsPerContainer`, `singular`, `plural`.
Le libellé se dérive (`ceil(qté / n)` + le mot). Un SKU sans réglage rend
`null` — la colonne est vide, elle ne ment pas.

⚠️ **Ce que la maquette montre et que nous n'aurons pas** : « +2 de casse ».
Aucune table ne porte de taux de casse, et l'inventer donnerait un nombre que
quelqu'un finirait par citer. La ligne est absente plutôt que fabriquée.

## 6. La catégorie reste côté écran

Le compte à produire ne connaît que des SKU — la production ne lit pas le
catalogue, et ne doit pas commencer. Le groupement par catégorie se fait donc
**dans l'écran**, par `production-recap.ts`, exactement comme le récapitulatif
d'aujourd'hui : il joint déjà le catalogue pour ses rayons.

⚠️ **Il y a cinq catégories, pas six** : `viennoiserie`, `pain`, `patisserie`,
`sale`, `chocolat`. La maquette en dessine six et invente « Boissons — sans
four ». Aucune catégorie réelle n'est sans four, et rien ne permet de le
déduire : l'onglet en pointillés n'est pas repris, et `ovenless` n'entre pas au
contrat — un champ que personne ne peut renseigner est une mesure fabriquée.

## 7. La catégorie ouverte suit la personne

Décidé le 2026-09-13 : pas d'affectation de poste. Chaque poste reçoit tout et
**se met sur sa page**, et cette page se retient par personne.

`ui-prefs.store.ts` l'avait prévu mot pour mot : « le jour où l'on veut vraiment
qu'une préférence suive la personne, c'est une colonne sur `staff_users` et un
`PATCH /admin/me/prefs` ». C'est ce jour-là.

`staff_users.nav_prefs` (sac JSON, comme `users.nav_prefs`) porte
`worksheetCategory`. Le localStorage ne convient pas : le téléphone du pétrin
n'est pas la machine du chef, et c'est la PERSONNE qui reprend son poste.

## 8. Le hors ligne

Le fournil est en sous-sol. La coche s'écrit **dans l'écran d'abord**, part
ensuite ; ce qui n'est pas parti attend dans une file locale et repart à la
reconnexion. Le pied dit « hors ligne » et combien de gestes attendent —
jamais un écran qui a l'air d'avoir enregistré alors que non.

Portée volontairement étroite : **les coches de cette fiche**, pas un mécanisme
de synchronisation général. Le handoff note que trois écrans le demandent ; en
faire une fondation maintenant, sur un seul usage réel, dessinerait la mauvaise
abstraction. Celle-ci est faite pour être reprise, pas pour être générale.

---

## 9. Les lots

| #   | Lot                                              | Fichiers                                      | Dépend de |
| --- | ------------------------------------------------ | --------------------------------------------- | --------- |
| A   | Contrat `production-worksheet.ts`                | `packages/contracts`                          | —         |
| B   | Agrégat + coches + retirage + routes + e2e       | `apps/lfd-api/src/production`, migration      | A         |
| C   | `nav_prefs` du staff + `PATCH /admin/me/prefs`   | `apps/lfd-api/src/staff/directory`, migration | A         |
| D   | Menu : prévisionnel d'abord, « Fournée du jour » | `shared/workspace-rail`, `app.html`           | —         |
| E   | L'écran : onglets, lignes, bandeau, téléphone    | `production/fiche-atelier/`                   | A         |
| F   | Le hors ligne + la file des coches               | l'écran, côté admin                           | E         |
| G   | Le contenant : réglage et écran                  | `production`, `reglages/`                     | A         |
| H   | Docs + ledger                                    | `documentation/production/`                   | tous      |

**Ce qui NE bouge pas** : `fiche-production/` (les bons de commande), la vue
Récapitulatif, `renderDeliveryNote`. La fiche d'atelier **ouvre** l'écran de la
Fournée du jour ; les deux autres vues restent derrière elle, intactes.

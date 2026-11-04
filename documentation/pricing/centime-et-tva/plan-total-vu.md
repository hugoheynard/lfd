# Le total vu est le total facturé

> 📝 Plan du 2026-11-03, doc-first : rien n'est bâti. Hugo, sur la surtaxe de
> retard dans le devis : « je ne suis pas certain si quelqu'un laisse traîner
> son panier » → option 2 ; « si le montant du retard est de 0, pas de
> message ». Il touche à l'argent et au contrat de passation : contredit par
> `vitruve` avant Hugo. Lot à part, après L2 du
> [plan du prix d'un panier](plan-un-seul-assemblage.md) (qui laisse É11 ouvert).

## 1. Le trou (vérifié le 2026-11-03)

- La boutique affiche le total du dernier devis ; le bouton porte le montant
  (« Régler 42,30 € », `cart-dialog.ts`). Un clic passe la commande
  (`place()`) : le serveur **recompose de zéro**, aux prix et règles de
  l'instant.
- **Carte** : l'écran de règlement montre ensuite le montant réel — mais la
  commande existe déjà.
- **Au compte** : aucun écran de paiement ; la commande file à la
  confirmation, au montant recomposé. **Un pro au compte peut être engagé sur
  un montant qu'il n'a jamais vu** : promotion terminée, supplément de retard
  apparu, prix ou zone changés pendant que le panier traînait.
- Aucun contrôle ne compare le total vu au total composé. Le devis ne chiffre
  pas la surtaxe (É11, `inventaire-c0-assemblages.md`).

## 2. La règle

**Une commande ne naît jamais à un montant que le client n'a pas vu.**

1. **Le devis chiffre la surtaxe prévue** (É11) : si l'heure limite est passée
   à l'instant du devis et qu'une dérogation est ouverte, la surtaxe est
   jugée **sans consommer** la dérogation (§2.3 du plan du prix d'un panier) et
   comptée au total. Un réglage de surtaxe absent ou à **0 € n'ajoute rien et
   ne dit rien** (Hugo) — ni ligne, ni mention.
2. **La passation reçoit le total vu** (`expectedTotalCents`, facultatif au
   contrat pour les clients déjà en ligne) et le compare au total de la
   commande qu'elle vient de composer, AVANT d'écrire.
   - Égaux : la commande naît.
   - Différents : refus 409 `orders.total_changed`, qui rend les nouveaux
     montants (la forme `BasketAmounts` du plan voisin) et **ce qui a changé**,
     par terme : surtaxe apparue, promotion terminée, prix d'une ligne, port.
     Rien n'est écrit.
3. **Le front** rechiffre et montre l'écart avant de laisser confirmer :
   « Le total est passé de 42,30 € à 47,30 € : votre commande arrive après
   l'heure limite, un supplément de 5 € s'applique. » Le client confirme (le
   nouveau total devient le total vu) ou modifie. **Un écart nul ne produit
   aucun message** — le refus n'existe que si le total diffère.

Le contrôle est au serveur : il vaut pour toutes les passations (boutique,
espace pro, saisie de l'équipe), carte comme compte, et pour la révision.

## 3. Ce que `vitruve` a corrigé (2026-11-03), intégré

- **Où comparer** (BLOQUANT) : juste après `draft` et **avant `settleOrder`**
  dans les trois passations (`place-order.handler.ts` l. 153-177,
  `place-shop-order.handler.ts`, `place-order-for-customer.handler.ts`) —
  sinon chaque refus laisse chez Stripe une intention sans commande.
- **Quoi comparer** (BLOQUANT) : le **TTC composé**, qui contient le HT et la
  TVA. Le pro au compte voit aujourd'hui deux nombres (le HT du récapitulatif,
  `cart-summary.ts` l. 229, et le TTC du bouton, `cart-dialog.ts` l. 403) :
  comparer le HT seul laisserait passer un changement de TVA.
- **La surtaxe n'existe que pour une société munie d'une dérogation**
  (`lateFeeFor`, `order-drafting.service.ts` l. 331-340 ; dérogation par
  `companyId`). Un anonyme ou un particulier n'en a jamais : passé l'heure
  limite sans dérogation, il est refusé, pas surtaxé. **T1 ne concerne que le
  devis d'un client connecté rattaché à une société.** La saisie de l'équipe
  l'a déjà (l'estimation rend `lateFeeCents`).
- **Réutilisation, pas conception** : `OrderCutoffWaiverGate.openFor` lit sans
  consommer ; `consume` ne vient qu'après `persist`. Le devis boutique passe
  `lateFee: null` en dur (`shop-cart-quoting.service.ts` l. 166-168) : T1 y
  amène le même jugement que `draft`, par le même code.
- **Idempotence** : `expectedTotalCents` est **hors de l'empreinte**
  (`order-fingerprint.ts`), sans quoi le rejeu d'un onglet qui a vu l'ancien
  total rendrait `IdempotencyKeyReusedError`. Test : « 409, puis renvoi avec
  le nouveau total sous la même clé → la commande naît ». Vérifier que la
  passation connectée rend sa clé au même endroit que la boutique.
- **Faux refus** (précondition) : T2 ne se bâtit qu'**après L2** du plan
  voisin, et un e2e de parité « même panier, devis = commande, au centime »
  le prouve avant. Sinon un arrondi ferait un 409 à chaque commande.
- **Un seul message par écart** : le 409 s'articule avec ce que le devis dit
  déjà (`removedLines`, `endedDiscounts`, bon expiré ou utilisé) — un écart,
  un message, nommé par terme.
- **Le champ obligatoire** : décision à prendre (§5).
- La révision recompose avec la surtaxe figée de la commande : elle est hors
  de ce plan, aucun lot ne la couvre.

## 4. Les lots

- **T1** ✅ _(bâti le 2026-11-03, non commité à l'écriture)_ — la surtaxe
  prévue au devis d'un client connecté avec société, par le jugement de
  `draft` (0 € = rien). `LateFeeJudgement` (`late-fee-judgement.service.ts`)
  porte le verdict pour la passation et le devis ; `OrderCutoffGate.foresee`
  lit la dérogation sans la consommer (`foreseenWaiver`, même décision
  qu'`ensureWithinOrderCutoff`). Le devis rend `lateFeeCents`, absent à zéro
  (champ additif de `ShopQuoteView`). Golden master : É11 retiré.
- **T2** ✅ _(bâti le 2026-11-03, non commité à l'écriture)_ — après L2 et sa parité : `expectedTotalCents` au contrat, hors
  empreinte ; refus 409 `orders.total_changed` après `draft` et avant
  `settleOrder` dans les trois passations ; e2e (surtaxe apparue, promotion
  terminée, prix changé, bon expiré, écart nul = commande normale, renvoi
  sous la même clé).
  Bâti : `ensureTotalSeen` (`domain/services/seen-total.ts`) lève
  `OrderTotalChangedError` dans les trois passations, au rang 7 bis de l'ordre
  des refus ; la réponse porte `expectedTotalCents` et `totalCents` en faits
  publiables (nombres). ⚠️ **Pas encore** : la forme de devis complète ni le
  détail « par terme » dans le 409 — l'enveloppe d'erreur ne publie que des
  nombres (`PublicErrorFacts`), et le serveur ne reçoit qu'un total, il ne
  peut pas savoir quel terme le client avait vu. Question ouverte pour T3
  (le front rechiffre et compare à son dernier devis ?). Un bon déjà servi
  garde son propre refus (rang inférieur) : un écart, un message.
  E2e : `test/order-total-seen.e2e-spec.ts`.
- **T3** ✅ _(bâti le 2026-11-04, non commité à l'écriture)_ — la boutique et la saisie l'envoient, et montrent l'écart en un
  seul message avant de confirmer. **Le bouton de validation est désactivé
  tant qu'un devis est en vol** (Hugo, 2026-11-03, sur un changement
  d'acheminement ou de zone) : le client qui change de mode ou d'adresse voit
  le nouveau total avant de pouvoir valider, et le refus ne sert qu'aux
  changements faits ailleurs (frais d'une zone modifiés par l'équipe,
  promotion terminée, prix, surtaxe, bon).
  Bâti : `expectedTotalCents` obligatoire aux trois passations ; l'estimation
  de la saisie a son propre schéma sans lui (`adminOrderEstimatePayloadSchema`).
  Le code du refus vit sans zod (`seen-total.values.ts`, exporté par
  `shop-values`). Boutique : `ClientOrders` envoie le TTC du devis affiché ;
  sur le 409, `ShopQuote.refresh()` redemande le devis et
  `TotalChangedCallout` compare les deux (`quote-changes.ts`), un message,
  « Commander à … » ou « Modifier mon panier » ; les encadrés des lignes
  retirées et des remises finies se taisent pendant ce temps. Saisie :
  `estimateReady` grise la validation, `estimate-changes.ts` compare, encadré
  « Valider au nouveau total ». ⚠️ Le rattrapage d'heure limite n'enchaîne
  plus la passation après la dérogation : l'estimation sous refus ne montrait
  aucun total, la dérogation se fait seule et la saisie se revalide au total
  estimé. E2e : le harnais confirme le total des passations qui ne le donnent
  pas (`test/seen-total-agent.ts`, `test/seen-total-shop-command.ts`).

## 5. Décision de Hugo (2026-11-03)

- **Le champ obligatoire** : `expectedTotalCents` **obligatoire dès T3**
  (pré-release, contrat cassable sur décision — CLAUDE.md §0 ; un front en
  cache non rechargé se ferait refuser jusqu'au rechargement), ou facultatif
  avec un compteur nommé des passations qui arrivent sans lui, puis
  obligatoire à une date ? **Tranché : obligatoire dès T3.**

## 6. Le détail « par terme » (tranché le 2026-11-03, au bâti de T2)

Le serveur ne reçoit que le total vu : il ne peut pas savoir quel terme le
client avait vu, et l'enveloppe d'erreur ne publie que des nombres
(`PublicErrorFacts`). Le 409 `orders.total_changed` porte donc
`expectedTotalCents` et `totalCents`, et nomme les deux montants. **Le détail
« ce qui a changé » est fait par T3, à l'écran** : sur un 409, la boutique et
la saisie redemandent un devis (ou une estimation) et comparent, terme à
terme, le dernier devis affiché au nouveau — surtaxe (`lateFeeCents`), port,
remises, `endedDiscounts`, `removedLines`, prix des lignes. C'est une
comparaison de deux réponses du serveur, pas un calcul : la règle « une seule
arithmétique » tient. Le front envoie le total du devis A (boutique, espace
pro) ou de l'estimation (saisie), jamais celui du devis B, qui ne garantit pas
le TTC (É16).

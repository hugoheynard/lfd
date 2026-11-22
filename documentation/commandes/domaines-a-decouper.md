# Les domaines à découper dans `lafoliecoffee/orders`

> **Inventaire, relu le 2026-11-20.** Ce qui, dans le bloc des commandes,
> mériterait d'être isolé comme le paiement l'a été dans `card-payment`. Deux
> candidats sont bâtis (le délai de commande, §2.1 ; le panier, §2.4), un est
> tranché sans découpage (les avis, §2.3) ; le départ incomplet (§2.2) n'est
> ni décidé ni bâti. Les comptes de fichiers ont été lus dans
> l'arborescence le 2026-11-20 (celui du §2.2, le 2026-11-10 ; le §2.3 relu dans le code le 2026-11-22) ; les couplages fins (qui lit
> quoi, qui écrit quoi) ne l'ont **pas** été — c'est la première étape de
> chaque chantier.

## Partie 1 — l'idée simple

`lafoliecoffee/orders` est le plus gros bloc du dépôt : **839 fichiers** hors tests au
2026-11-20. Tout ce qui touche une commande y a été rangé, y compris ce qui a
son propre métier.

Le paiement en est sorti (plan M2, bloc `card-payment`) parce qu'il avait son
propre cycle de vie et n'avait pas besoin de savoir ce qu'est une commande.
La question à poser à chaque partie est la même :

> **A-t-elle son propre métier, ses propres états, et pourrait-elle répondre
> à une question sans connaître l'intérieur d'une commande ?**

Si oui, elle gagne à devenir un contexte à part, que la commande interroge
par un canal — un seul endroit à changer quand sa règle change.

```mermaid
flowchart LR
  O["lafoliecoffee/orders<br/>la commande, ses avis (notices/)"]
  D["lafoliecoffee/order-cutoffs<br/>trop tard ? surtaxe ? (bâti)"]
  S["Départ incomplet<br/>manque, décision, reliquat"]
  P["src/shop-cart<br/>le panier (bâti)"]
  O -- "demande un verdict" --> D
  S -- "écoute les faits du colisage" --> O
  P -- "devient une commande" --> O
```

## Partie 2 — les candidats

### 2.1 Le délai de commande (l'heure limite) — bâti

**Fait** (lots V1 à V7 du verdict, 2026-11-19). Le jugement vit dans
`lafoliecoffee/order-cutoffs`, derrière une seule question, `OrderDeadline`
(`order-cutoffs/{domain,application,infrastructure}/deadline/`) : un juge pur
et ses sources. Ceux qui appliquent le verdict restent dans `orders` — la
passation, l'avis d'heure limite, la surtaxe prévue, la modification et la
hausse, la relance et les suggestions. L'ancien jugement est retiré (V7), et
`lint:order-deadline-door` refuse qu'on le réimporte ou qu'on appelle une
fonction de décision hors du juge ; sa dette est vide.

Le même jour, le verdict a appris le **dépassement d'une limite de produit**
(lots O1 à O7) : l'équipe passe outre, avec un droit, un motif et une trace,
à la saisie comme à la modification ; le plancher suit le geste (J6).

**Ce qui reste couplé** (relevé du 2026-11-20) : 23 fichiers de `orders` hors
tests importent `order-cutoffs/`, dont 8 citent `OrderDeadline`. Le canal
reste à l'intérieur du bloc `lafoliecoffee`, sans porte de frontière : c'est la
discipline de l'`index.ts` qui le tient, pas la matrice.

Doc d'état :
[`../limites-de-commande/le-verdict-de-l-heure-limite.md`](../limites-de-commande/le-verdict-de-l-heure-limite.md) ;
le dépassement :
[`../limites-de-commande/passer-outre-la-limite-d-un-produit.md`](../limites-de-commande/passer-outre-la-limite-d-un-produit.md).

### 2.2 Le départ incomplet — le plus proche du paiement

**Aujourd'hui.** Environ **48 fichiers** dans `orders` : le manque constaté
(`OrderShortfall`), la décision (`ShortfallDecision`), l'avis
(`ShortfallNotice`), le courrier, les reliquats et leur expédition
(`order-remainder-settler`, `remainder-shipment`). Il écoute déjà le
colisage par des faits (`on-packing-shortfall-reported` / `-cleared`). Doc
d'état : [`reliquat/reliquat.md`](reliquat/reliquat.md).

**Le signe.** Ses propres agrégats, son propre cycle (constater, décider,
écrire, relivrer) ; sa clé est la commande, mais son métier est « ce qu'on
n'a pas pu livrer et ce qu'on en fait » — la même forme que le retrait,
sorti du fournil le 2026-09-10.

**Le prix.** 27 autres fichiers de `orders` le citent (relevé du
2026-11-10) : il faudrait un canal, pas un simple déménagement.

### 2.3 Les avis à la clientèle — rangés, pas découpés

**Tranché le 2026-11-22** après lecture des couplages : un sous-dossier, pas un
contexte à part.

**Ce que le code contient** (lu le 2026-11-22) — trois familles, pas une :

- **Les abonnés purs**, rangés dans `orders/notices/` : les `@DurableHandler`
  qui envoient « commande passée », « réglée », « prête », « paiement échoué »,
  « paiement expiré », « en route », l'avis à l'adresse d'une commande sans
  compte et « reliquat remboursé », avec les trois services qu'ils partagent
  (`OrderPlacedMail`, `OrderReadyMail`, `DeliveryEnRouteMail`). Ils ne décident
  rien. « Annulée » et « modifiée » restent dans `cancellation/` et
  `revision/`, à côté du fait qu'elles écoutent.
- **Les relances du staff ne sont pas des avis, ce sont des gestes** :
  `send-handover-reminder` et `warn-customer-of-delay` chargent et sauvent
  l'agrégat `OrderCustomerNudges` (une fois chacune, pas avant le délai, un
  retrait ouvert seulement) ; `request-no-show-notice` écrit l'état « pas
  venu » ; `resend-order-payment-link` dépend des règles du paiement. L'e-mail
  y est l'effet du geste. Elles restent dans `orders/application/commands/`.
- **Le reste a déjà sa place** : la liste des e-mails d'une commande lit
  `mail/channels/deliveries/`, le consentement lit `mail/channels/marketing/`,
  la lettre du départ incomplet appartient au §2.2, et la sonnerie d'un
  e-mail en rebond est une alerte au staff.

**Pourquoi pas un contexte à part.** Le bloc `mail` découple déjà l'envoi, et
les abonnés sont déjà durables. Un contexte séparé ne leur retirerait aucune
dépendance : il remplacerait l'import de `Mail` par une demi-douzaine de
lectures que `orders` devrait publier — destinataire, origines, lien de
gestion, fiche de commande, bon archivé, reliquat. Plus de surface, aucun
invariant de mieux tenu.

### 2.4 Le panier de la boutique — bâti

**Fait** le 2026-11-20 : un bloc de premier niveau, `src/shop-cart/`, avec son
schéma Postgres `cart` et sans clé étrangère. Le chiffrage du panier reste au
commerce ; le catalogue lui demande par `ShopCartSkuUsage` si un article est
dans un panier. État : [`le-panier.md`](le-panier.md).

### 2.5 Ce qui reste dans `orders`, rangé en sous-dossiers

**L'annulation** et **la modification** (hausse et baisse comprises) agissent
sur l'état de la commande à chaque étape : elles sont le cœur du bloc, pas des
contextes à part. Chacune a son sous-dossier depuis le 2026-11-10 :
`orders/cancellation/` (87 fichiers) et `orders/revision/` (119 fichiers), aux
mêmes couches que le reste des commandes.

## L'ordre proposé

1. ~~**Le délai de commande**~~ — bâti le 2026-11-19 (§2.1).
2. **Le départ incomplet** — le prochain : le cas le plus net, et un canal à
   concevoir.
3. ~~**Le panier**~~ — bâti le 2026-11-20 (§2.4).
4. ~~**Les avis à la clientèle**~~ — rangés dans `orders/notices/` le
   2026-11-22, sans en faire un contexte (§2.3).

Chacun commence par la lecture des couplages réels, puis un plan court, puis
`vitruve` (une frontière se déplace), avant tout code.

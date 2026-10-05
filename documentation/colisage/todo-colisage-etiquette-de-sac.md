# TODO — imprimer l'étiquette d'un sac, comme celle d'un bac

**Ouvert le 2026-10-05** (Hugo, au poste de colisage).

## Le fait

Au poste, un **bac** (commande en livraison) porte un bouton « Étiquette »,
et la commande un « Imprimer les étiquettes » : les deux mènent à
`/livraison/etiquettes/:orderId` (`?bacs=<binId>` pour un seul), page servie
par la livraison, qui imprime le code court et le QR du bac.

Un **sac** (commande en retrait) n'a rien : ni bouton, ni page. Les deux
boutons ne s'affichent que si la commande a des bacs (`hasBins()`, dans
`production/colisage/packing-container-board/`). Vérifié le 2026-10-05.

## Ce qu'il faudrait

- Un bouton « Étiquette » sur chaque sac, et « Imprimer les étiquettes » sur
  une commande en retrait qui a des sacs — même place, même icône que sur les
  bacs.
- Une étiquette de sac : client, référence de la commande, « Sac N / M »,
  jour et lieu de retrait.

## Questions ouvertes

- **Qui sert la page ?** Celle des bacs appartient à la livraison, qui ne
  connaît pas les sacs (le sac naît au colisage). La page des sacs vit donc
  plutôt au colisage, ou au retrait (`handover`), qui remet le sac au comptoir.
- **Un QR sur le sac ?** Utile seulement si le comptoir scanne au retrait.
  Aujourd'hui, le retrait se fait par le QR de la commande, pas du sac.
- **Le même gabarit d'impression** que les bacs (format, imprimante) ?

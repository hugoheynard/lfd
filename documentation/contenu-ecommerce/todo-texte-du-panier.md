# TODO — le texte du panier, réglé au back-office

> 📋 **Noté le 2026-11-05**, demande de Hugo : « c'est un texte à définir en
> admin, "texte du panier", qui n'existe pas : mets-le en chantier ». Rien
> n'est conçu ni bâti.

## Ce qui s'est passé

Le panier de la boutique affichait deux phrases écrites dans le code, qui
parlaient au nom de la maison sans qu'elle les ait choisies :

- sous le titre de la bulle du panier : « Relisez, ajustez, réglez. La fournée
  se cale sur votre créneau. » (clé `cart.intro`) ;
- dans le panier vide : « Panier vide. La fournée du matin part vite — le ski
  praliné ne fait jamais l'après-midi. » (clé `shop.cartEmpty`).

Retirées le 2026-11-05 : la première a disparu (déclarée `cart.intro: null`
dans `shop-copy-renames.json`) ; la seconde dit seulement « Votre panier est
vide. ».

## Ce qu'on veut

Un **« texte du panier »** que l'équipe écrit au back-office : un message
d'actualité ou de saison (« La bûche se commande jusqu'au 20 », « Fermé le
1ᵉʳ mai »), affiché dans le panier, vide ou non, et qu'on peut laisser vide
— alors rien ne s'affiche.

## Ce qu'il faudra trancher avant d'écrire le plan

- **Par clientèle** : un texte pour les pros et un pour les particuliers, ou un
  seul ? (Les autres réglages de la boutique sont par clientèle.)
- **Langues** : FR seul, ou FR/EN/IT comme les textes de la boutique ?
- **Où il vit** : un réglage de contenu à part (comme le pied de page,
  `content/footer`, en cache Cloudflare et purgé à l'écriture) — plutôt qu'une
  clé du recueil des textes, qui sert à reformuler les textes existants, pas à
  publier un message.
- **Une période d'affichage** (du … au …) ou un simple texte qu'on efface.
- **Où exactement** : la bulle du panier, la page panier, les deux ?

## Ce qui existe et peut servir

- Le pied de page éditable (`apps/lfd-api/src/lafoliecoffee/content/`), servi par une
  route publique en cache et purgé à chaque écriture : le même chemin
  conviendrait.
- L'éditeur des textes de la boutique
  ([`plan-textes-de-la-boutique.md`](plan-textes-de-la-boutique.md)) : à ne pas
  confondre — il remplace des textes existants, il ne crée pas de message.

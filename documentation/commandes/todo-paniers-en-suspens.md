# À réfléchir — les paniers clients en suspens

> **Ouvert le 2026-11-21, à la demande de Hugo.** Rien n'est décidé ni bâti.

## La question

L'onglet « Brouillons » de `/commandes` ne montre que les saisies **du staff**
(`OrderDraft`, écrites par `admin/order-drafts`, un par compte). Un client qui
remplit son panier dans la boutique sans commander n'y paraît pas : son panier
en cours vit dans le bloc `shop-cart`, schéma `cart`
([le-panier.md](le-panier.md)).

Faut-il montrer ces paniers en suspens au back-office ?

## Ce qui est déjà su

- **Ce n'est pas un brouillon à reprendre.** Le panier appartient au client,
  dans son espace ; l'équipe ne le « reprend » pas à sa place. C'est plutôt une
  **liste de relance commerciale** : qui a hésité, sur quoi, depuis quand.
- **La frontière.** Les commandes ne lisent pas les tables de `shop-cart`. Le
  bloc du panier publierait une lecture nommée (« les paniers non vides,
  inchangés depuis N heures ») que l'écran composerait — §3 du `CLAUDE.md`,
  « le propriétaire parle de ce qui est à lui ».
- **Les données personnelles.** Montrer le panier d'une personne au staff
  touche au registre RGPD (`lint:rgpd-staff` pour le staff ; ici, c'est le
  client) et à ce que le texte d'information lui annonce.

## Ce qu'il faudrait trancher

1. À qui c'est utile : le commercial (relance d'un pro), le comptoir, personne ?
2. Pros seulement, ou particuliers aussi ?
3. Une liste à consulter, ou une relance automatique (e-mail « votre panier
   vous attend ») — qui serait alors un sujet du bloc `mail` et du consentement.
4. Où ça vit à l'écran : un onglet des commandes, ou la fiche du compte.

# Plan — la barre du panier accompagne le parcours

> ✅ **Bâti le 2026-10-27 (non commité).** `OrderContextStore.draft`,
> `OrderDoors` (`track`/`note`, `resume()`, `startAt()`), `CartBar` (états du
> brouillon, entrée `docked`), `client/cart/journey-bar/` montée en `@defer`
> dans le shell, pieds retirés des dialogues du jour et de l'heure. Écarts :
>
> - **Le brouillon a tous ses champs facultatifs**, `date` compris : partie
>   d'une porte, la commande connaît son mode avant son jour. Il porte aussi
>   `pickupAddressId` et `address`, pour que la reprise rouvre l'heure de la
>   maison retenue sans la redemander. En mémoire seulement.
> - **Il n'est gardé à la fermeture que s'il dit quelque chose et qu'aucun
>   choix complet n'existe** : un « Modifier » abandonné laisse la barre dire
>   le service retenu, et fermer le panneau du jour sans rien avoir dit ne
>   laisse pas de barre « Choisissez le jour ».
> - **En livraison, l'étape après le jour se dit « Choisissez l'adresse »**
>   (`commandTerms.chooseAddress`) — le plan ne nommait que le jour et l'heure.
> - **La barre dit « Ma commande · Retrait » puis « Le Labo · jeu. 29 oct. »**,
>   et l'étape sur le bouton : la mise en page de la barre existante, pas une
>   ligne unique.
> - **En pied de dialogue, l'étape est un état inactif**, et sans brouillon
>   (modification d'une commande passée) la barre ne s'y montre pas.
> - **Hors boutique, « Régler » mène à `/boutique`** ; la barre du shell n'est
>   pas montée sur la boutique, qui garde la sienne. Au bureau, elle n'est
>   visible que tant qu'un brouillon existe.
> - **La croix existait déjà** : `fold-panel-header` rend toujours sa croix en
>   haut à droite (`closeLabel` en est le nom accessible). Seul le pied est
>   retiré ; le mixin `foot-link` de `_dialog.scss`, devenu sans lecteur, aussi.
> - **La carte d'une maison de l'accueil** passe par `OrderDoors.startAt()` au
>   lieu de recopier la séquence jour → heure : sans quoi ce parcours-là
>   n'avait pas de brouillon.
> - Textes retirés : `slotPicker.cta`, `ctaIdle`, `back` (renommés en `null`).

> 📝 Plan du 2026-10-27, idée de Hugo : « à partir du moment où on a choisi la
> date on devrait toujours avoir la barre de récap du bas qui se complète au
> fur et à mesure des étapes », en réutilisant « la barre de panier qui sera
> ensuite présente dans la boutique, elle existe déjà et remplit ce rôle ».
> Suite de [`parcours-de-service.md`](parcours-de-service.md). Front seul.

## 1. Ce qui existe (lu le 2026-10-27)

- `CartBar` (`client/cart/cart-bar/`) : le pied collé de la boutique, en pile
  seulement. Il dit le service retenu (« Ma commande · Retrait — Le Labo ·
  jeu. 29 oct. 7 h 30 », « Modifier ») puis « Régler » avec le compte et le
  total. Il n'est monté que par `shop-page.html`.
- Il ne lit que `OrderContextStore.choice`, qui n'existe qu'une fois tout
  choisi (jour, lieu, heure). Entre le panneau du jour et l'heure, rien.
- Les étapes vivent dans des dialogues fold **modaux** : la page derrière est
  inerte et voilée.

## 2. Ce qui change

1. **Un brouillon de parcours** dans `OrderContextStore` : `draft = { date,
mode?, place? }`, posé par `OrderDoors` à chaque étape (jour choisi, mode
   choisi, maison choisie), effacé quand le choix complet s'écrit. Fermer un
   dialogue en route **garde** le brouillon : la barre dit où l'on s'est
   arrêté, et son geste reprend à cette étape.
2. **La barre suit le parcours.** Elle se monte dans le shell client (et non
   plus la seule boutique) dès qu'il y a un brouillon ou un choix, et dit :
   - jour seul : « jeu. 29 oct. · Choisissez l'heure » ;
   - jour et lieu : « Le Labo · jeu. 29 oct. · Choisissez l'heure » ;
   - tout : comme aujourd'hui, puis « Régler » dès que le panier compte.
     En pile comme au bureau pendant le parcours ; au bureau, une fois le
     parcours fini, la barre « Ma commande » du haut de la boutique reste celle
     qui parle.
3. **Dans l'étape 2, la barre EST le pied** (Hugo, 2026-10-27 : « sur étape 2
   on enlève le footer du panel, on met une croix à la place de fermer en haut
   à droite, et à la place du footer on met la barre »). `SlotPickerDialog`
   perd son pied (« Retour », « Choisissez un créneau ») ; « Fermer » devient
   une croix en haut à droite ; la barre du panier se monte dans le pied du
   dialogue — le même composant, donc cliquable, sans passer par-dessus le
   voile. Elle dit le jour et le lieu, puis l'heure dès qu'un créneau est
   touché, et porte le geste qui valide (« Continuer » vers la boutique, ou
   « Régler » si le panier compte déjà).
   **Un clic sur une heure avance** (Hugo, 2026-10-27, le bouton « Je prends à
   … » retiré) : il ferme l'étape sur ce créneau, et la barre dit aussitôt le
   jour, le lieu et l'heure avec « Modifier ». Pas de bouton de validation : se
   tromper d'heure ne coûte rien et se répare en un geste ; le seul geste qui
   engage reste « Régler ».
   **Dès l'étape 1 aussi** (Hugo, 2026-10-27 : « elle sait si on est retrait
   ou livraison ») : partie d'une porte de l'accueil, la commande connaît son
   mode avant le jour. Le panneau du jour porte la même barre en pied —
   « Retrait · Le Labo · Choisissez le jour », « Livraison · Choisissez le
   jour » — ; partie de « Où et quand ? » sans mode, la barre dit seulement
   « Choisissez le jour ». Un clic sur un jour avance, comme une heure.
4. **Ailleurs pendant le parcours** (panneau du jour, choix du lieu, adresse),
   la barre de la page reste dessous, sous le voile : elle n'a pas à y être
   lue, l'étape 2 la montre.

## 3. Tests

Le brouillon (posé, complété, effacé, gardé à la fermeture) ; la barre (trois
états) ; un parcours de bout en bout dans `order-doors.spec.ts`.

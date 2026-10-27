# Plan — la barre du panier accompagne le parcours

> 📝 Plan du 2026-10-27, idée de Hugo : « à partir du moment où on a choisi la
> date on devrait toujours avoir la barre de récap du bas qui se complète au
> fur et à mesure des étapes », en réutilisant « la barre de panier qui sera
> ensuite présente dans la boutique, elle existe déjà et remplit ce rôle ».
> Suite de [`plan-panneau-date.md`](plan-panneau-date.md). Front seul.

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
3. **Visible pendant les dialogues.** La barre est posée hors de la région que
   le dialogue modal rend inerte, au-dessus de son voile, et la feuille du bas
   (en pile) s'arrête au-dessus d'elle. Elle s'y lit ; elle ne s'y clique pas
   (le dialogue garde le focus). À vérifier en bâtissant : où fold monte ses
   panneaux et son voile, et si la feuille accepte un retrait en bas.

## 3. Tests

Le brouillon (posé, complété, effacé, gardé à la fermeture) ; la barre (trois
états) ; un parcours de bout en bout dans `order-doors.spec.ts`.

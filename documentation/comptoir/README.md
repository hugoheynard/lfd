# Le comptoir — le poste de la boutique

> Doc d'état, écrite le 2026-11-03 après la journée de finitions de l'écran
> (Hugo). Elle décrit le back-office tel qu'il est sur `dev` ce jour-là ; ce qui
> n'est pas encore bâti est marqué comme tel.

Le comptoir est l'espace du back-office tenu par le personnel de la boutique, sur
une tablette. Il réunit trois gestes, dans trois onglets, dans cet ordre (Hugo,
2026-11-03) :

| Onglet                        | Icône     | Droit                                        | Code                                                                    |
| ----------------------------- | --------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| **Retrait commande `<site>`** | colis     | `handover_counter:read`                      | `apps/lfd-backoffice-frontend/src/app/handover-shop/`                   |
| **Nouvelle commande pro**     | panier    | `b2b_counter:read` + `b2b_place_order:write` | `apps/lfd-backoffice-frontend/src/app/comptoir/`                        |
| **Réassort `<site>`**         | croissant | `handover_counter:read`                      | `apps/lfd-backoffice-frontend/src/app/comptoir/reassort-boutique-page/` |

Le point (`<site>`) est celui de la bande de tête : le retrait et le réassort le
lisent à la même source (`HandoverQueueStore.activePlace`), et leurs onglets le
nomment (`comptoir-masthead.ts`).

## Le retrait commande

La file du jour à gauche, le **rail** de la commande choisie à droite.

**La barre de la file** — une seule ligne : la vue (Tout, À remettre, En retard,
Retirées), le sens de lecture (plus ancien ou plus récent en tête), la recherche
et **le seul bouton de scan** de l'écran. Le scan identifie la commande et ouvre
sa fiche ; il ne remet rien. Une ligne scannée que la vue ou la recherche cache
fait repasser la file sur « Tout ».

**Le retard** se dit sous la ligne, avec son origine, comme en Supervision
(`causeOf`) : en alerte quand le sac n'était pas prêt à la fin du créneau (« par
nous »), en avertissement quand il l'était et que le client n'est pas venu. Il
ne sonne qu'au-delà de la **tolérance de retard** (Réglages › Commandes, 15 min
par défaut), la même que la Supervision lit côté serveur ; les relances au
client comptent depuis la fin de cette tolérance. 🟦 La lecture de la tolérance
par l'écran du comptoir est en cours de bâti le 2026-11-03 (le serveur et sa
route `GET /admin/counter/late-tolerance` sont commités).

**Le rail** :

- l'identité, puis **deux bons chiffrés** sous la date : le **bon de commande**
  (celui que le client a reçu, `GET /admin/counter/orders/:orderId/bon.pdf`) et
  le **bon de livraison**, grisé tant que rien n'est remis — il chiffre ce qui
  est parti. Les deux s'ouvrent en PDF dans un dialogue (`counter-note-panel`).
  Les VUES du comptoir restent sans montant ; ce sont les documents qui le
  portent (règle du 2026-09-11 levée pour eux, voir
  [`todo-revue-retrait-boutique.md`](todo-revue-retrait-boutique.md), §1) ;
- le sac : par ligne, « au bac / commandé » dans le ton de son état, puis deux
  coches — le four, le bac — vert, orange (en partie, au bac seulement), rouge ;
  en tête, le même compte pour le sac entier ;
- **un seul geste** : « Remettre la commande ». La mention au-dessus dit si le QR
  a été lu ; les gestes sont atténués, jamais désactivés, tant que le four ou le
  bac n'a pas fini, et seule la retenue qualité garde sa phrase.

## Où lire le reste

- Le retrait comme **bloc métier** (`src/handover/`, la garde, comptoir ou
  livraison) : [`../retrait/architecture-contexte-retrait.md`](../retrait/architecture-contexte-retrait.md).
- Le QR d'une commande : [`../commandes/la-commande/vie-du-qr-d-une-commande.md`](../commandes/la-commande/vie-du-qr-d-une-commande.md).
- La commande pro au comptoir et son droit : [`architecture-commande-au-comptoir.md`](architecture-commande-au-comptoir.md).
- Le réassort, vu du comptoir puis du fournil : [`../reassort-boutiques/commander.md`](../reassort-boutiques/commander.md).
- La commande prise sur le stock de la vitrine : [`../limites-de-commande/jour-meme-sur-stock.md`](../limites-de-commande/jour-meme-sur-stock.md).

## Reste à faire

- La revue de l'écran : [`todo-revue-retrait-boutique.md`](todo-revue-retrait-boutique.md).
- Les statuts du comptoir et la Production sous son propre droit (en suspens) :
  [`todo-comptoir-statuts-et-droit-production.md`](todo-comptoir-statuts-et-droit-production.md).

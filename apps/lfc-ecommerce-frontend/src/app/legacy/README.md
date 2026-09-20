# `legacy/` — l'espace pro de la génération précédente

Ces treize dossiers sont la **première version** de l'app : boutique B2B, panier,
paniers enregistrés, commandes, entreprises, profil, réglages, tableau de bord.
Ils compilent, ils sont testés, et **aucune route ne les atteint** —
`FEATURE_PRO_SPACE` est à `false`.

## Pourquoi ce nom, et pas `pro/`

Parce que « pro » ne distingue personne : **tout le monde est un client
professionnel**. Ce qui varie, c'est qu'une partie d'entre eux n'a pas encore
ouvert son _espace pro_ — et ça, c'est un état du compte, pas une catégorie
d'utilisateur ni une famille d'écrans. Un dossier `pro/` aurait laissé croire à
deux publics quand il n'y en a qu'un.

Ce qui sépare vraiment ces dossiers du reste, c'est leur **génération**. D'où
`legacy/`.

## Ce qu'on y fait

Rien. On n'ajoute pas d'écran ici, et on n'y corrige que ce qui casse la
compilation. Tout écran neuf va dans l'app cliente.

## Ce qui en sort — corrigé le 2026-09-05

Ce paragraphe disait « la seule dépendance qui en sort », en nommait une, et se
trompait sur les deux points. Il en sort **cinq**, toutes statiques :

| depuis          | quoi                                                     |
| --------------- | -------------------------------------------------------- |
| `app.ts`        | `CartPanel`, `CartService`, `ContactPanel`, `SiteFooter` |
| `app.config.ts` | `AddressesService`                                       |

Elles vivent dans la **racine de composition** et dans le composant
**bootstrappé** : ce ne sont donc pas des imports paresseux, et le code hérité
entre dans le bundle initial de l'app vivante. C'est le vrai coût du dossier, et
c'est celui-là qu'il faudra payer le jour où il part.

S'ajoutent les `import()` **paresseux** d'`app.routes.ts`, qui ne comptent pas de
la même façon : ils sont derrière `FEATURE_PRO_SPACE`, donc absents du routeur et
du bundle tant que le drapeau est à `false`.

**Ce qui n'en sort plus** : `account/account.service.ts` — et non
`account.model.ts`, que l'ancien texte nommait — importait `CatalogueView` d'ici.
Le fichier `catalogue/catalogue-view.ts` ne fait que **ré-exporter** ce type de
`@lfd/contracts` : il n'a jamais appartenu à cette génération, et le faire
transiter par elle donnait à croire qu'il en dépendait. L'import va désormais à
la source. Ce dossier n'exporte donc plus **aucun type** au code vivant.

## Ce qui reste branché à l'app vivante, et qu'on ne peut pas retirer d'un `if`

Le chrome PRO d'`app.html` — rail, en-tête, déclencheur de panier avec son
badge — n'est **pas** derrière `FEATURE_PRO_SPACE`, alors que ses routes le sont.
Avec le drapeau à `false`, `proRoutes` est vide et toute adresse hors `/login`
tombe sous `ClientShell` : cette branche du gabarit ne se rend donc que pour un
utilisateur **authentifié posé sur `/login`**.

Ce n'est pas corrigé ici, et pour une raison : la corriger demande de couper
`App` en deux coquilles, parce qu'un composant ne se retire pas d'un tableau
`imports` sur la foi d'une constante — Angular exige un tableau statique. Un
`@if` dans le gabarit masquerait l'écran sans alléger le bundle, ce qui donnerait
l'illusion du geste sans le geste.

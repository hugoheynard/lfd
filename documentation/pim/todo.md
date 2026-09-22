# LFC PIM — TODO & décisions ouvertes

> **Ce qui reste à trancher et à faire. Rien d'autre.**
>
> 🔴 **Nettoyé le 2026-09-22, et c'est le sujet du fichier.** Il portait **50
> lignes cochées** pour 17 ouvertes : un registre de tout ce qui a été fait, dans
> lequel ce qui restait ne se voyait plus. Un TODO qui garde ses points faits
> cesse d'être une liste de travail et devient une archive — et on cesse de
> l'ouvrir.
>
> **Ce qui est parti n'est pas perdu** : le chemin est dans
> [`ledger.md`](./ledger.md), les décisions structurantes dans
> [`adr.md`](./adr.md), et chaque point fait l'était déjà dans le code. Vérifié
> point par point contre le dépôt avant retrait — dix étaient faits sans être
> cochés.
>
> ⚠️ **La règle, pour la suite** : un point pris se **retire**, il ne se coche
> pas. S'il mérite d'être raconté, il va au journal.

---

## 1. Décisions à trancher (produit / métier)

| #   | Sujet                                          | Enjeu                                                                                                                                                                           | Statut         |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| D1  | **Nature exacte du B2B**                       | Revente pros confirmée ? Paliers de volume + tarifs négociés par client. ⚠️ Le code a **déjà bâti** les deux (mercuriale par société) : la décision est peut-être prise de fait | 🟠 à confirmer |
| D2  | **Plan de production labo : auto ou manuel ?** | Consolidation auto de la demande multi-canal → plan, ou planification manuelle assistée ? ⚠️ `PrismaProductionPlanReader` consolide déjà par journée arrêtée — à relire         | 🟠 à confirmer |
| D3  | **Périmètre recettes / BOM**                   | Nomenclatures matières dans le scope v1 (calcul besoins farine…) ou plus tard ? Aucune table `Recipe` n'existe                                                                  | 🔴 ouvert      |
| D5  | **TVA**                                        | Taux paramétrables + distinction emporter / sur place — à confirmer avec le comptable. Le mécanisme technique, lui, **est bâti**                                                | 🟠 à confirmer |
| D7  | **Résolution des prix**                        | Par **spécificité** (la règle la plus précise gagne) ou par **priorité numérotée** ? La 1ʳᵉ est plus élégante, la 2ᵈᵉ plus prévisible pour un commercial qui débogue seul       | 🔴 ouvert      |

> ✅ **D4 (accès PI Electronique / Helios) est close le 2026-09-22** — Hugo : « PI
> disparaît de notre vie ». Elle était « l'inconnue n°1 » et ne bloque plus rien.
>
> 🔴 Elle emporte le **déclencheur de révision d'ADR-15**, qui justifiait de
> construire le PIM par « la valeur est dans la jonction » entre la caisse, le web
> et le fournil : **deux des trois sont partis en deux jours**. La question est
> reposée dans [`adr.md`](./adr.md), pas ici.
>
> ✅ **D6 (frontières d'agrégat)** close le 2026-07-21 → `Product` racine.

---

## 2. Fondations

- [ ] **Passerelle de configuration côté front** — permettrait de retirer la
      dérogation du rendu serveur inscrite dans le gate `no-direct-env`, qui porte encore son
      commentaire « à retirer d'ici le jour où il en aura une ».
- [ ] **`category-form-store.ts` est à 315 lignes** (limite ≲300). La coupe
      naturelle est un brouillon **canaux**, symétrique des brouillons éditorial et
      média qui existent déjà : canaux, contextes réglables et taux à enregistrer sont un
      seul sujet.
- [ ] **Converger `ProductFormStore` sur `shared/lang-switch/localized-field.ts`**
      — le même motif de saisie traduisible y est écrit à la main, en plus ancien.
      Deux copies d'une règle (« vider une traduction l'EFFACE, la source ne
      s'efface pas ») finissent par ne plus dire la même chose de « traduit ».

---

## 3. Domaine & données

- [ ] **Tables restantes du socle** : `collection`, `product_collection`.
- [ ] **Le front redéclare `Category` / `Product`** dans `pim/data/models.ts`,
      alors que `@lfd/pim-contracts` porte déjà les vues de fil. Le contrat
      existe ; c'est l'écran qui ne s'en sert pas pour ses propres modèles.
- [ ] **Verbes manquants** : `AddVariant`, `ChangeVariantSku`. Un commentaire de
      test le dit de lui-même (« tant qu'`AddVariant` n'existe pas »).
- [ ] **Format du SKU partagé à la compilation** (motif, longueurs, `normalize`).
      🔴 Le véhicule est `packages/pim-contracts` — **pas** un `shared-types`
      global, que le `CLAUDE.md` interdit nommément. `SKU_PATTERN` ne vit
      aujourd'hui qu'au backend.
- [ ] **`product_certification`** (labels : bio, IGP, AOP…) — `certifications`
      fait foi, pas de booléen.
- [ ] **Event store append-only** : **différé** (ADR-11 révisé). Déclencheur =
      premier besoin d'as-of réel.
- [ ] 🟠 **Français résiduel dans le code backend** — les libellés passés aux
      value-objects (`localizedText("nom", …)`), présents dans **6 fichiers**. Le
      gate `code-language` ne les voit pas : il blanchit les littéraux avant de
      compter, donc un libellé d'erreur lui échappe **par construction**.
- [ ] **Porter les docs de cadrage restantes** : pricing, disponibilité.

---

## 4. Contextes de vente et TVA

- [ ] **Appartenance TVA — projection par contexte de vente**
      ([`contextes-et-points-de-vente.md`](./contextes-et-points-de-vente.md)).
      ⚠️ Le besoin a **survécu à son canal** : le contexte « sur place » est actif
      et vendu, et **aucun canal n'en fabrique une seconde fiche**. C'est une
      question du modèle, pas d'un fournisseur — elle se repose telle quelle au
      prochain canal public.
- [ ] **Override local au produit — disponibilité + TVA** (🟡 moitié faite).
- [ ] **À trancher** : le retrait B2B doit-il aussi retirer le _binding_ de canal,
      ou rester une conséquence de la matrice ? Aujourd'hui : conséquence — le
      binding reste, la fiche revient si on rouvre le canal.

🔴 **Voir aussi**
[`todo-le-vocabulaire-shopify-survit-au-canal.md`](./todo-le-vocabulaire-shopify-survit-au-canal.md) :
deux colonnes du contexte de vente ont survécu au canal, et une garde peut
**refuser une création** au staff à cause d'elles.

---

## 5. Révisions du catalogue

- [ ] **Filtrer un diff par nature de changement** — ajout / suppression /
      modification / publication. Trois des quatre existent déjà dans la réponse ;
      le filtre est alors une facette d'écran, sans aller-retour de plus.

      La quatrième demande une décision : une **publication** est aujourd'hui une
          `modification` comme une autre. La sortir en catégorie propre veut dire
          qu'un article qui change de statut ET de prix apparaît dans **deux**
          facettes, ou qu'on choisit laquelle l'emporte. ⚠️ Trancher avant d'écrire :
          un article qui disparaît d'un filtre parce qu'il a aussi changé de prix est
          le genre d'absence qu'on ne remarque pas.

- [ ] **Purger les contenus orphelins** — un `catalog_content` que plus aucune
      révision ne référence ne disparaît pas (clé étrangère `RESTRICT`, à dessein).
      Sans ancre supprimable aujourd'hui, la question ne se pose pas ; elle se
      posera au premier archivage de vieilles révisions.

🔴 **Capacité perdue, à noter ici** : le dépôt n'a plus **aucun** point d'ancrage
rejouable ni retour arrière de publication depuis le retrait du canal Shopify
(2026-09-21). Défaire une publication se fait en republiant, pas en revenant.

---

## 6. Paramétrage produit

- [ ] **Conditionnements → `/pim/conditionnements`.** La table existe
      (`product_packaging` : référence propre, quantité, poids brut, prix, canaux) ;
      **rien ne la saisit**, ni ici ni sur la fiche. L'écran affiche aujourd'hui un
      `fold-empty-state` « Écran à venir ».

      Ce qui vient ici est le **vocabulaire** — les types de conditionnement et ce
          qu'ils nomment. Combien d'unités dans le carton d'un produit donné reste sur
          la fiche : c'est une propriété de ce produit.

          Le point qui justifie l'écran : un conditionnement porte sa **propre
          référence**. Le professionnel commande « le carton de 24 », pas « 24 fois
          l'article » — c'est ce qui en fait autre chose qu'une quantité.

---

## 7. Provenance — le chantier ouvert

➡️ **[`ingredients-et-approvisionnement.md`](./ingredients-et-approvisionnement.md)**
(2026-09-22) : « beurre de Savoie » n'est pas un ingrédient, c'est le produit d'un
fournisseur. Le genre et ses lignes d'approvisionnement datées se séparent, et
l'origine, l'appellation et les allergènes descendent d'un niveau.

🔴 Rien n'est bâti, **cinq questions** y attendent une décision, et `vitruve` est
obligatoire — le plan fait entrer un **prix d'achat** dans le référentiel.

---

## 8. Prochaine étape

➡️ **Côté code** : `AddVariant` (saisir les déclinaisons), puis l'écran
Conditionnements — c'est le seul écran posé et vide.

➡️ **Côté décision** : les cinq questions de l'approvisionnement, et celle
d'ADR-15 que la sortie de PI vient de rouvrir.

⚠️ Cette section pointait le **questionnaire PI** jusqu'au 2026-09-22. Il n'a plus
d'objet.

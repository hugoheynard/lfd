# Le cockpit annonce un coup sur un identifiant, pas sur un nom

**Ouvert le 2026-09-09**, signalé depuis l'écran. ✅ **Clos le 2026-09-12** pour
le libellé ; la question du « cache de compte client » reste ouverte, en bas.

> **Corrigé — et le défaut portait plus loin que ce document ne le disait.**
> `scoreActivation` n'était pas le seul lecteur : la colonne **« Société »** du
> tableau des activations (`commercial/prospects/activation`) affichait le même
> `companyId` brut, sur un écran entier dont c'est la première colonne. Une
> correction limitée au cockpit aurait laissé l'autre en place.
>
> **Ce qui a été fait** : `ActivationView` gagne `companyName`, résolu par le
> port `CompanyNamer` du même contexte — qui gagne un `namesOf` **par lot**,
> une lecture pour tout le tunnel plutôt qu'une par ligne.
>
> **La décision qui n'était pas dans le plan** : le nom n'est **pas figé**.
> `OnOrderPlaced` grave le sien dans le payload — une commande de 2024 doit
> nommer son client comme il s'appelait en 2024 — et la tentation était de
> copier ce geste sur `company.declared`. Elle aurait raté sa cible : un coup
> `rescue` désigne un dossier **bloqué depuis des semaines**, donc déclaré
> avant le correctif. Figer en avant n'aurait nommé que les dossiers qui ne
> sont pas encore en retard, c'est-à-dire exactement ceux qu'on n'appelle pas.
> Le tunnel relit donc à chaque passe : c'est une file d'appels, pas une
> archive, et on rappelle les gens par leur nom du jour.
>
> Le repli sur l'identifiant subsiste, mais il est devenu ce que le JSDoc du
> contrat prétendait déjà : le cas où la société a disparu de la base entre
> deux recomputes. Cette phrase-là est redevenue vraie.
>
> Couvert par une régression à chaque étage : la projection
> (`activation.spec.ts`), le scoring (`lead-score.spec.ts`), le libellé
> **persisté** et le fait qu'il ne soit demandé qu'un lot
> (`recompute-lead-scores.handler.spec.ts`), et le vrai SQL
> (`activations.e2e-spec.ts`) — le seul à traverser `namesOf`.

## Le symptôme

Dans « Les cinq meilleurs coups du jour » (`commercial/cockpit`), certaines
lignes portent un identifiant technique — `cmf3k2...` — là où les autres portent
un nom ou une adresse e-mail.

## Ce n'est pas un repli, c'est le cas nominal

**Vérifié le 2026-09-09** dans `apps/lfd-api/src/b2b/growth/domain/lead-score.ts`,
les trois fabriques de coups :

| Coup      | Sujet    | Libellé                                              |
| --------- | -------- | ---------------------------------------------------- |
| `nurture` | lead     | `lead.businessName` ✅                               |
| hot / mid | personne | `prospect.email`, **avec repli** sur l'identifiant   |
| `rescue`  | société  | `activation.companyId` — 🔴 **toujours**, sans repli |

`scoreActivation` (`:213`) écrit `label: activation.companyId` sans condition.
Le JSDoc du contrat dit pourtant « e-mail connu du journal, **sinon**
l'identifiant » (`packages/contracts/src/growth.ts:98`) : c'est vrai des deux
premières familles, faux de la troisième — et la phrase couvre le défaut en
laissant croire à un cas rare.

**La cause est en amont** : `ActivationView` ne porte **pas** de nom. Elle a
`companyId`, `declaredVia`, les pièces, la complétion — et rien qui se lise à
voix haute. La fabrique n'avait donc rien d'autre à mettre.

⚠️ **C'est le coup le plus coûteux à rater** : `rescue` désigne un dossier
d'inscription bloqué, c'est-à-dire un client qui a commencé et s'est arrêté.
C'est exactement l'appel qu'on passe le matin, et on ne le passe pas si la ligne
ne dit pas à qui.

## La sortie

`ActivationView` gagne le nom de la société, et `scoreActivation` le lit. La
question à trancher est **où le nom est lu** : le read-model des activations est
alimenté par `growth`, qui ne possède pas la table `companies` — c'est
`b2b/account`. Le remède doit donc dire par quel port, sans ouvrir une lecture
directe de plus.

⚠️ Ne pas « corriger » en résolvant le nom **côté écran** : le libellé est
persisté dans `lead_scores.label` et relu tel quel, donc un patch d'affichage
laisserait la valeur fausse en base et un second écran la réafficherait.

## Et le cache de compte client — la question reste ouverte

Demandé en même temps, et **je n'ai pas trouvé de quoi il s'agit**. Écrit ici
plutôt que deviné, parce qu'un remède posé sur la mauvaise hypothèse coûte plus
qu'une question.

Ce qui a été cherché le 2026-09-09, sans résultat :

- aucun cache côté **front admin** — ni service, ni signal, ni `Map` mémorisée
  sur la fiche client ou le compte ;
- côté **backend**, un seul cache touche ces écrans : `PricingMaterialsCache`.
  Il ne garde pas de compte : il retient des **tables entières**, sous une clé
  qui ne porte que le nom de la table (`pricing.module.ts`, et le JSDoc de
  `pricing-materials.loader.ts` le dit).

🔴 **Une piste sérieuse, du même jour** : la fiche client montrait la limite
tarifaire **d'avant** une re-pose — pas par un cache, mais par une clause `where`
à qui manquait la fenêtre de validité (corrigé le 2026-09-09, cf. R17). Une
donnée périmée à l'écran ressemble à un cache sans en être un. Si ce qui a été
observé est de cet ordre, c'est peut-être déjà réglé.

**Ce qu'il faut pour avancer** : quel écran, quelle valeur périmée, et pendant
combien de temps.

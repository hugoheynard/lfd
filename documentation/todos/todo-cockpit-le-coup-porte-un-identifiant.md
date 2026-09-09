# Le cockpit annonce un coup sur un identifiant, pas sur un nom

**Ouvert le 2026-09-09**, signalé depuis l'écran. 🟠 Dette **active** : l'écran
qui sert à décider qui rappeler nomme sa cible par une chaîne que personne ne
reconnaît.

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

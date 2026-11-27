// Un sous-chemin à part : la boutique le charge au démarrage (le panier), et
// il n'importe aucune valeur de `@lfd/contracts` — seulement des types.
export {
  choiceCeilingOf,
  choiceQuantityOf,
  FRENCH_OPTION_WORDS,
  lineOptionMentions,
  offeredChoicesOnly,
  optionChoicesField,
  settleLineOptions,
  withChoiceQuantity,
} from './line-options';
export type { LineOptionChoice, LineOptionWords } from './line-options';
export { LineOptionsPicker, FRENCH_PICKER_WORDS } from './line-options-picker/line-options-picker';
export type { LineOptionsPickerWords } from './line-options-picker/line-options-picker';

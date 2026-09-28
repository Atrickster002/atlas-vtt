import type { TutorialStep } from './Tutorial';
import lootBaseImage from '../assets/tutorials/loot-base.webp';
import lootItemNoteImage from '../assets/tutorials/loot-item-note.webp';
import lootPlayerViewImage from '../assets/tutorials/loot-player-view.webp';

/**
 * The loot tours: the Loot tab of the collection settings, the loot roller the
 * first time it has items, and the first roll. Each shows once; Atlas'
 * settings replay them.
 */

export const LOOT_TUTORIAL_LABEL = 'Loot';

export const LOOT_SETTINGS_STEPS: TutorialStep[] = [
  {
    title: 'Loot lives in your notes',
    body: 'Write each item as a note and gather the notes in an Obsidian base. Every view of the base, like Weapons or Tier 2, becomes a list the loot roller can draw from, with the view’s own filters.',
    image: { src: lootBaseImage, alt: 'A base of item notes with a view per kind of item' },
  },
  {
    title: 'Properties Atlas reads',
    body: 'Price, Rarity, Type and Description are picked up by name; Cost, Quality, Category and Effect work too. The view’s other columns show on the item’s card, under the names the base gives them.',
    image: { src: lootItemNoteImage, alt: 'An item note with its type, rarity, price and feature properties' },
  },
  {
    title: 'Add your bases',
    body: 'Add one base or several. Atlas shows how many views and items it found in each, and keeps track of a base you rename or move.',
    selector: '.atlas-csm-loot-bases',
  },
  {
    title: 'Name your currency',
    body: 'Prices that are plain numbers read in this currency, like “500 gold”. Each roll keeps the currency it was made with.',
    selector: '.atlas-csm-loot-currency',
  },
];

/** The loot roller's tour; the rarity step only while the items name rarities. */
export function lootRollerSteps(hotkey: string, hasRarities: boolean): TutorialStep[] {
  return [
    {
      title: 'Pick what to roll from',
      body: 'Tick whole bases, or open one and tick single views. Rolls draw only from ticked views, and an item in several of them counts once.',
      selector: '.atlas-loot-roller__sidebar',
    },
    ...(hasRarities ? [{
      title: 'Filter by rarity',
      body: 'Each rarity shows how many of its items you can roll. Switch one off to leave its items out, say for a village market.',
      selector: '.atlas-loot-rarities',
    }] : []),
    {
      title: 'Roll',
      body: `Choose how many items to draw and roll; every item left has the same chance. Press ${hotkey} to open and close this window on any map. Each map remembers where you left it.`,
      selector: '.atlas-loot-rollbar__actions',
    },
    {
      title: 'Latest roll and history',
      body: 'Latest roll shows the last roll on this map. History keeps every roll in the collection, from all its maps, so you can look up what the party found last session.',
      selector: '.atlas-loot-pane-tabs',
    },
  ];
}

export const LOOT_RESULT_STEPS: TutorialStep[] = [
  {
    title: 'Read an item',
    body: 'Its colour shows the rarity: uncommon green, rare blue, epic purple, legendary orange; common items stay plain. Type and price come first, then the description and the view’s columns.',
    selector: '.atlas-loot-list .atlas-loot-card',
  },
  {
    title: 'Hand it to your players',
    body: 'The eye shows the item in the player view, in a Loot received window large enough to read across the table. Show more and they stack; players close it with a click outside or Escape.',
    selector: '.atlas-loot-list .atlas-loot-card__show',
    image: { src: lootPlayerViewImage, alt: 'The Loot received window in the player view' },
  },
  {
    title: 'Open the item',
    body: 'Opens the item’s note to read or edit it. Changes reach future rolls; rolls already made keep what they drew.',
    selector: '.atlas-loot-list .atlas-loot-card__source',
  },
];

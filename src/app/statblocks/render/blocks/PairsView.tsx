import React from 'react';
import type { PairsBlock } from '../../model/templateTypes';
import { formatSigned, numericValue } from '../../values/numberText';
import { normalisePairs, type Pair } from '../../values/pairValues';
import { valueText } from '../../values/valueText';
import { useSheet } from '../sheetContext';
import { LabelledLine } from '../values/LabelledLine';
import { StandIn, ValueText } from '../values/ValueText';
import { ValueSlot } from '../valueSlot';
import type { BlockViewProps } from './blockViewProps';

const FIRST_LETTER = /^\p{Ll}/u;

/** "dex" as a statblock writes it: "Dex". */
function pairName(key: string): string {
  const name = key.trim();
  return name.replace(FIRST_LETTER, (letter) => letter.toUpperCase());
}

/** One pair: "Dex +5", or the name alone where it has no value ("Stealth"). */
function pairText(pair: Pair, signed: boolean): string {
  const number = signed ? numericValue(pair.value) : null;
  const value = number === null ? valueText(pair.value) : formatSigned(number);
  return value.trim() ? `${pairName(pair.key)} ${value}` : pairName(pair.key);
}

/** "**Saving Throws** Dex +5, Con +3". */
export function PairsView({ block, display }: BlockViewProps<PairsBlock>): React.JSX.Element {
  const { state } = useSheet();
  const label = block.label ?? state.fields.get(block.field)?.label ?? block.field;
  const signed = block.display === 'signed';
  const value = display.state === 'value' ? state.reader(block.field) : undefined;
  const pairs = normalisePairs(value);
  // A value that holds no pairs shows as it is written.
  const text = pairs.length ? pairs.map((pair) => pairText(pair, signed)).join(', ') : valueText(value);

  return (
    <LabelledLine label={label} className="atlas-sb-pairs">
      <ValueSlot block={block}>{display.state === 'value' ? <ValueText shown={{ text, problems: [] }} /> : <StandIn display={display} />}</ValueSlot>
    </LabelledLine>
  );
}

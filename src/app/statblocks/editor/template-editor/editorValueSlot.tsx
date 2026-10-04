import React from 'react';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import type { ImageBlock, TemplateBlock } from '../../model/templateTypes';
import { useSheet } from '../../render/sheetContext';
import { statblockImageSrc } from '../../render/shared/statblockImage';
import type { ValueEditing } from '../../render/valueSlot';
import { valueText } from '../../values/valueText';
import { TokenSocketFace } from '../token-socket/TokenSocketFace';
import '../token-socket/token-socket.scss';

/** The Image block as the note view draws it beside a note, without its panel: the template editor links no token. */
function ImageSocket({ block, art }: { block: ImageBlock; art: React.ReactNode }): React.JSX.Element {
  const { state, app, sourcePath } = useSheet();
  const named = valueText(state.reader(block.field));
  const src = app && named ? statblockImageSrc(app, named, sourcePath) : '';
  const shown = block.shape === 'token' && src ? <TokenPortrait className="atlas-sb-token-image" src={src} alt="" showRing /> : art;
  return <TokenSocketFace shape={block.shape} art={src ? shown : null} prompt={named ? 'Art not found' : 'Add token art'} tabIndex={-1} />;
}

function slot(block: TemplateBlock, values: React.ReactNode): React.ReactNode {
  return block.type === 'image' ? <ImageSocket block={block} art={values} /> : values;
}

/**
 * The template editor's values (§2.1): drawn as the note view draws them, so
 * the card is the same; the Image block shows the note view's token socket.
 */
export const EDITOR_VALUE_EDITING: ValueEditing = { slot };

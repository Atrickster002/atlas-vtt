import React from 'react';
import type { TemplateBlock } from '../model/templateTypes';
import { blockDisplay, type BlockDisplay } from './blockDisplay';
import { BlockFrame } from './BlockFrame';
import { useSheet } from './sheetContext';
import { DividerView } from './blocks/DividerView';
import { EntriesView } from './blocks/EntriesView';
import { HeadingView } from './blocks/HeadingView';
import { ImageView } from './blocks/ImageView';
import { LineView } from './blocks/LineView';
import { PairsView } from './blocks/PairsView';
import { RowView } from './blocks/RowView';
import { ScoresView } from './blocks/ScoresView';
import { ScriptView } from './blocks/ScriptView';
import { SectionView } from './blocks/SectionView';
import { SpellsView } from './blocks/SpellsView';
import { StatView } from './blocks/StatView';
import { TabsView } from './blocks/TabsView';
import { TagsView } from './blocks/TagsView';
import { TextView } from './blocks/TextView';
import { TitleView } from './blocks/TitleView';
import { TrackView } from './blocks/TrackView';

/** A list of blocks, each in its frame; the root and every Section and Row render their children with it, Tabs one per panel. */
export function BlockList({ blocks }: { blocks: readonly TemplateBlock[] }): React.JSX.Element {
  return <>{blocks.map((block) => <BlockView key={block.id} block={block} />)}</>;
}

function content(block: TemplateBlock, display: BlockDisplay): React.ReactNode {
  switch (block.type) {
    case 'section': return <SectionView block={block} display={display}><BlockList blocks={block.blocks} /></SectionView>;
    case 'row': return <RowView block={block} display={display}><BlockList blocks={block.blocks} /></RowView>;
    case 'tabs': return <TabsView block={block} display={display} renderBlock={(tab) => <BlockView block={tab} />} />;
    case 'title': return <TitleView block={block} display={display} />;
    case 'line': return <LineView block={block} display={display} />;
    case 'stat': return <StatView block={block} display={display} />;
    case 'scores': return <ScoresView block={block} display={display} />;
    case 'tags': return <TagsView block={block} display={display} />;
    case 'text': return <TextView block={block} display={display} />;
    case 'entries': return <EntriesView block={block} display={display} />;
    case 'pairs': return <PairsView block={block} display={display} />;
    case 'track': return <TrackView block={block} display={display} />;
    case 'image': return <ImageView block={block} display={display} />;
    case 'spells': return <SpellsView block={block} display={display} />;
    case 'heading': return <HeadingView block={block} display={display} />;
    case 'divider': return <DividerView />;
    case 'script': return <ScriptView />;
    case 'opaque': return null;
  }
}

/** One block of a template, rendered for the statblock, or nothing where it hides. */
export function BlockView({ block }: { block: TemplateBlock }): React.JSX.Element | null {
  const { state } = useSheet();
  const display = blockDisplay(block, state);
  if (!display) return null;
  return <BlockFrame block={block} display={display}>{content(block, display)}</BlockFrame>;
}

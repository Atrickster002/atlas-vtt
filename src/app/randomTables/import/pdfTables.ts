import { dieOfHeader, readRollCell } from '../dieRanges';
import { headingName } from '../markdownTables';
import { tablesOfNote } from '../noteTables';
import { tableNoteText } from '../tableMarkdown';
import type { PastedTable } from '../pastedTable';
import { TABLE_LIMITS } from '../tableModel';
import { IMPORT_LIMITS, hasUnreadableText, validateImportTable, type ImportCandidate, type TableDiscovery } from './importModel';
import { pdfLines, spanText, type PdfLine, type PdfSpan } from './pdfLayout';

interface Header {
  start: number;
  end: number;
  anchors: number[];
  headers: string[];
  combined: boolean;
}

/** A roll prefix in a single text span, trying bounded word boundaries from longest to shortest. */
function numberedLine(text: string): [string, string] | null {
  const matches = [...text.slice(0, 80).matchAll(/\S+/g)].slice(0, 6);
  for (const match of matches.toReversed()) {
    const end = match.index + match[0].length;
    const prefix = text.slice(0, end);
    if (readRollCell(prefix) !== null && text.slice(end).trim() !== '') return [prefix, text.slice(end).trim()];
  }
  return null;
}

/** Header word fragments are joined only across small gaps; a second die starts another table. */
function headersOf(line: PdfLine): Header[] {
  const groups: PdfSpan[][] = [];
  for (const span of line.spans) {
    const last = groups.at(-1);
    const previous = last?.at(-1);
    if (previous && span.x - previous.x - previous.width < line.height * 1.4) last!.push(span);
    else groups.push([span]);
  }
  const starts = groups.flatMap((group, index) => {
    const text = spanText(group);
    const first = text.split(/\s/, 1)[0] ?? '';
    return dieOfHeader(first) ? [index] : [];
  });
  return starts.map((start, index) => {
    const endGroup = starts[index + 1] ?? groups.length;
    const cells = groups.slice(start, endGroup);
    const firstText = spanText(cells[0]!);
    const dieWord = firstText.split(/\s/, 1)[0]!;
    const combined = firstText !== dieWord;
    const headers = combined ? [dieWord, firstText.slice(dieWord.length).trim(), ...cells.slice(1).map(spanText)] : cells.map(spanText);
    return {
      start: cells[0]![0]!.x,
      end: groups[endGroup]?.[0]?.x ?? Infinity,
      anchors: cells.map((cell) => cell[0]!.x),
      headers,
      combined,
    };
  }).filter((header) => header.headers.length >= 2 && header.headers.length <= TABLE_LIMITS.columns);
}

function inLane(line: PdfLine, header: Header): PdfSpan[] {
  return line.spans.filter((span) => span.x >= header.start - line.height * 1.5 && span.x < header.end - line.height * 0.5);
}

function cellsOf(spans: readonly PdfSpan[], header: Header, height: number): string[] | null {
  if (header.combined) {
    // Combined roll/result spans support a two-column table only. A split cannot be guessed.
    if (header.headers.length !== 2) return null;
    const text = spanText(spans);
    return numberedLine(text) ?? ['', text];
  }
  const columns = header.anchors.map(() => [] as PdfSpan[]);
  for (const span of spans) {
    const index = header.anchors.findLastIndex((anchor) => span.x >= anchor - height * 0.6);
    if (index < 0) return null;
    const nextAnchor = header.anchors[index + 1];
    if (nextAnchor !== undefined && span.x + span.width > nextAnchor + height * 0.3) return null;
    const previous = columns[index]!.at(-1);
    if (previous && span.x < previous.x + previous.width - height * 0.2) return null;
    columns[index]!.push(span);
  }
  return columns.map(spanText);
}

function titleAbove(lines: readonly PdfLine[], index: number, header: Header): string {
  const previous = lines[index - 1];
  const current = lines[index]!;
  if (!previous || current.y - previous.y > current.height * 3.5) return '';
  const spans = inLane(previous, header);
  const text = spanText(spans);
  if (spans.some((span) => span.x + span.width > header.end)) return '';
  const headingStyle = spans.some((span) => span.height > current.height * 1.05) || (/[A-Z]/.test(text) && text === text.toUpperCase());
  if (!headingStyle || text.length > IMPORT_LIMITS.nameCharacters || /[.!?;]$/.test(text) || readRollCell(text) !== null) return '';
  return headingName(text);
}

function appendCell(previous: string, next: string): string {
  if (!next) return previous;
  const brokenWord = /\p{L}-$/u.test(previous) && /^\p{Ll}/u.test(next);
  return brokenWord ? previous.slice(0, -1) + next : previous ? `${previous} ${next}` : next;
}

function tableBelow(lines: readonly PdfLine[], index: number, header: Header): PastedTable | null {
  const rows: string[][] = [];
  let lastY = lines[index]!.y;
  let rowHeight = lines[index]!.height;
  for (let at = index + 1; at < lines.length; at++) {
    const line = lines[at]!;
    const spans = inLane(line, header);
    if (spans.length === 0) continue;
    if (headersOf(line).some((next) => Math.abs(next.start - header.start) < line.height * 2)) break;
    if (line.y - lastY > rowHeight * 2.5 || spans.some((span) => span.height > rowHeight * 1.15)) break;
    const cells = cellsOf(spans, header, line.height);
    if (!cells || cells.some(hasUnreadableText)) return null;
    if (readRollCell(cells[0] ?? '') !== null) {
      if (rows.length === TABLE_LIMITS.rows) return null;
      rows.push(cells);
    } else {
      if (cells[0] !== '' || rows.length === 0) break;
      const previous = rows.at(-1)!;
      for (let column = 1; column < cells.length; column++) previous[column] = appendCell(previous[column]!, cells[column]!);
    }
    lastY = line.y;
    rowHeight = line.height;
  }
  if (rows.length < 2 || rows.some((row) => row.slice(1).every((cell) => cell === ''))) return null;
  const table = { headers: header.headers, rows, numbered: true };
  try { validateImportTable(table); } catch { return null; }
  const model = tablesOfNote(tableNoteText('Table', table), 'Table').tables[0];
  // Partial/multi-page ranges, overlaps and unreadable cells cannot be offered as complete tables.
  return model?.die && model.problems.length === 0 ? table : null;
}

/** Complete dice tables on a single page. Unclear geometry and partial tables are skipped, never guessed. */
export function discoverPdfTables(spans: readonly PdfSpan[], page: number): TableDiscovery {
  if (spans.length > IMPORT_LIMITS.pageItems) return { tables: [], warnings: ['skippedTables'] };
  const lines = pdfLines(spans);
  const tables: ImportCandidate[] = [];
  let skipped = false;
  for (let index = 0; index < lines.length; index++) {
    for (const header of headersOf(lines[index]!)) {
      if (new Set(header.headers.slice(1).map((text) => text.toLowerCase())).size !== header.headers.length - 1) {
        skipped = true;
        continue;
      }
      const table = tableBelow(lines, index, header);
      if (!table) { skipped = true; continue; }
      tables.push({ name: titleAbove(lines, index, header), table, page });
    }
  }
  return { tables, warnings: skipped ? ['skippedTables'] : [] };
}

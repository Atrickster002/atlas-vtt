import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Braces } from 'lucide-react';
import { ToolButton } from '../../../../packages/components/primitives/ToolButton';
import { cn } from '../../../../../utils/cn';
import { fieldLabels } from '../../../values/fieldValues';
import { useTemplateEditor } from '../editorContext';
import type { EditorSession } from '../sessionTypes';
import { fieldChoiceGroups, type FieldChoice } from './fieldChoices';
import { choiceId, FieldChoiceList } from './FieldChoiceList';
import { buildPatternLine, caretInText, caretToEnd, chipInPlace, chipsIn, insertPlainText, readPatternLine } from './patternDom';
import { chipLook, openValueAt, patternPieces, type ChipLook } from './patternPieces';
import { patternPreview } from './patternPreview';
import { useGestureText, useTextGesture } from './useGestureText';

export interface PatternEditorProps {
  labelledBy: string;
  value: string;
  session: EditorSession;
  onText: (pattern: string) => void;
  disabled: boolean;
  placeholder?: string | undefined;
}

/** A value being typed after `{`: where it starts, and what follows the brace. */
interface Typing {
  node: Text;
  start: number;
  query: string;
}

const NO_KEYS = new Map<string, number>();

/**
 * The pattern editor (§5.6, §7.4): the pattern's text with each value as a
 * chip named in words. Typing `{` offers the template's fields; typing a whole
 * `{key}` turns into a chip too. Below it, what the pattern writes with the
 * sample values, or what is wrong with it in plain words. "Edit as text"
 * shows the syntax itself.
 */
export function PatternEditor({ labelledBy, value, session, onText, disabled, placeholder }: PatternEditorProps): React.JSX.Element {
  const { snapshot } = useTemplateEditor();
  const { template } = snapshot;
  const [asText, setAsText] = useState(false);
  const [typing, setTyping] = useState<Typing | null>(null);
  const [active, setActive] = useState(0);
  const lineRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const previewId = useId();
  const gesture = useTextGesture({ value, session, onText });
  const raw = useGestureText({ value, session, onText });
  const lookOf = useMemo(() => {
    const labelOf = fieldLabels(template.fields);
    return (source: string): ChipLook => chipLook(source, labelOf);
  }, [template.fields]);
  const preview = useMemo(() => patternPreview(value, template), [value, template]);
  const groups = useMemo(
    () => (typing ? fieldChoiceGroups(template, typing.query, null, NO_KEYS, false) : []),
    [typing, template],
  );
  const choices = groups.flatMap((group) => group.choices);
  const highlighted = choices[Math.min(active, choices.length - 1)];

  // The line follows the template, except while the author types into it.
  useLayoutEffect(() => {
    const line = lineRef.current;
    if (!line) return;
    const focused = line.doc.activeElement === line;
    if (focused && readPatternLine(line) === value) return;
    buildPatternLine(line, value, lookOf);
    if (focused) caretToEnd(line);
  }, [value, lookOf, asText]);

  /** Reads the line after the author changed it: whole values become chips, a `{` opens the fields. */
  const changed = (): void => {
    const line = lineRef.current;
    if (!line) return;
    const text = readPatternLine(line);
    if (patternPieces(text).filter((piece) => piece.kind === 'value').length !== chipsIn(line)) {
      buildPatternLine(line, text, lookOf);
      caretToEnd(line);
    }
    gesture.change(text);
    const caret = caretInText(line);
    const start = caret ? openValueAt(caret.node.data, caret.offset) : -1;
    setTyping(caret && start >= 0 ? { node: caret.node, start, query: caret.node.data.slice(start + 1, caret.offset) } : null);
    setActive(0);
  };

  const pick = (choice: FieldChoice): void => {
    const line = lineRef.current;
    const caret = line ? caretInText(line) : null;
    if (!line || !typing || !caret || caret.node !== typing.node) return;
    const source = `{${choice.key}}`;
    chipInPlace(line, typing.node, typing.start, caret.offset, source, lookOf(source));
    setTyping(null);
    gesture.change(readPatternLine(line));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.nativeEvent.isComposing) return;
    const count = choices.length;
    if (typing && event.key === 'ArrowDown' && count) setActive((index) => (index + 1) % count);
    else if (typing && event.key === 'ArrowUp' && count) setActive((index) => (index - 1 + count) % count);
    else if (typing && (event.key === 'Enter' || event.key === 'Tab') && highlighted) pick(highlighted);
    else if (typing && event.key === 'Escape') setTyping(null);
    else if (event.key === 'Enter') gesture.finish();
    else if (event.key === 'Escape' && gesture.cancel()) setTyping(null);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="atlas-te-pattern">
      <div className="atlas-te-pattern__row">
        {asText ? (
          <input {...raw} type="text" className="atlas-te-input atlas-te-input--code" aria-labelledby={labelledBy}
            aria-describedby={preview ? previewId : undefined} disabled={disabled} spellCheck={false} placeholder={placeholder} />
        ) : (
          <div
            ref={lineRef}
            className={cn('atlas-te-input atlas-te-pattern__line', disabled && 'atlas-te-pattern__line--disabled')}
            contentEditable={!disabled}
            tabIndex={disabled ? -1 : 0}
            role="textbox"
            aria-labelledby={labelledBy}
            aria-describedby={preview ? previewId : undefined}
            aria-disabled={disabled || undefined}
            aria-autocomplete="list"
            aria-expanded={typing !== null}
            aria-controls={typing ? listId : undefined}
            aria-activedescendant={typing && highlighted ? choiceId(listId, highlighted) : undefined}
            data-placeholder={placeholder}
            spellCheck={false}
            onInput={changed}
            onKeyDown={onKeyDown}
            onBlur={() => {
              setTyping(null);
              gesture.finish();
            }}
            onPaste={(event) => {
              event.preventDefault();
              const line = lineRef.current;
              if (!line) return;
              insertPlainText(line, event.clipboardData.getData('text/plain').replace(/\s*[\r\n]+\s*/g, ' '));
              changed();
            }}
            onDrop={(event) => event.preventDefault()}
          />
        )}
        <ToolButton
          icon={Braces}
          label={asText ? 'Show fields by name' : 'Edit as text'}
          isActive={asText}
          disabled={disabled}
          onClick={() => setAsText((was) => !was)}
        />
      </div>
      {typing && (
        <FieldChoiceList id={listId} label="Fields" groups={groups} active={highlighted}
          onHover={(choice) => setActive(choices.indexOf(choice))} onPick={pick} />
      )}
      {preview && (
        <p id={previewId} className={cn('atlas-te-pattern__preview', preview.problem && 'atlas-te-pattern__preview--problem')}>
          {preview.problem ?? `Shows “${preview.text}”`}
        </p>
      )}
    </div>
  );
}

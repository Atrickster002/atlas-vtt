import React, { forwardRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { renderEntries, type ContextMenuEntry } from '../../../react/components/context-menu/AtlasContextMenu';
import { Button } from '../../../packages/components/primitives/button';
import { useExclusiveDropdown } from '../../../packages/components/primitives/useExclusiveDropdown';
import { cn } from '../../../../utils/cn';

interface PaneMenuButtonProps {
  entries: ContextMenuEntry[];
  /** The trigger's visible text, which names it. */
  children: React.ReactNode;
  className?: string | undefined;
  disabled?: boolean | undefined;
}

/**
 * A text button that opens an Atlas menu below it (context-menu geometry,
 * `atlas-ctx-menu`), for the pane's header: the template, the collection.
 * The icon-only "…" is `ActionsMenuButton`.
 */
export const PaneMenuButton = forwardRef<HTMLButtonElement, PaneMenuButtonProps>(
  ({ entries, children, className, disabled }, ref) => {
    const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
    const { isOpen, setIsOpen, onCloseAutoFocus } = useExclusiveDropdown();
    const setRefs = (element: HTMLButtonElement | null): void => {
      setTrigger(element);
      if (typeof ref === 'function') ref(element);
      else if (ref) ref.current = element;
    };

    return (
      <DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen} modal={false}>
        <DropdownMenu.Trigger asChild disabled={disabled}>
          <Button ref={setRefs} type="button" variant="ghost" size="sm" className={cn('atlas-sb-pane-menu-button', className)}>
            <span className="atlas-sb-pane-menu-button__text">{children}</span>
            <ChevronDown aria-hidden="true" className="atlas-sb-pane-menu-button__chevron" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal container={trigger?.ownerDocument.body}>
          <DropdownMenu.Content
            className="atlas-ctx-menu atlas-ctx-menu--dropdown"
            side="bottom"
            align="start"
            sideOffset={4}
            collisionPadding={8}
            onCloseAutoFocus={onCloseAutoFocus}
            onEscapeKeyDown={(event) => event.stopPropagation()}
          >
            {renderEntries(entries, () => setIsOpen(false))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  },
);

PaneMenuButton.displayName = 'PaneMenuButton';

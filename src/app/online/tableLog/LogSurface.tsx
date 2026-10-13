import { useSyncExternalStore, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LogUnreadTab } from './LogUnreadTab.tsx';
import type { TableLogPanelProps } from './panelTypes.ts';
import { TableLogPanel } from './TableLogPanel.tsx';

/** The log as a host without a button for it shows it: the floating panel's props, whether it is open, and how the tab opens it. */
export interface LogSurfaceProps extends Omit<TableLogPanelProps, 'variant'> {
  readonly open: boolean;
  readonly onOpen: () => void;
}

/** The floating panel while it is open; while it is closed, a tab at the left edge that counts what came in meanwhile and opens it. */
function LogSurface({ open, onOpen, ...panel }: LogSurfaceProps): ReactElement | null {
  const { unread } = useSyncExternalStore(panel.state.subscribe, panel.state.snapshot);
  if (open) return <TableLogPanel {...panel} variant="floating" />;
  return unread > 0 ? <LogUnreadTab count={unread} onOpen={onOpen} /> : null;
}

/** A log surface standing in a host's element: `show` draws it with new props, `unmount` takes it away. */
export interface LogSurfaceMount {
  show(props: LogSurfaceProps): void;
  unmount(): void;
}

/** Mounts the log's surface in `host`, for a host that is not written in React (the GM's Obsidian). */
export function mountLogSurface(host: HTMLElement): LogSurfaceMount {
  const root = createRoot(host);
  return {
    show: (props) => root.render(<LogSurface {...props} />),
    unmount: () => root.unmount(),
  };
}

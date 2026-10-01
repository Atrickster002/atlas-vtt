import React from 'react';
import type { RootOptions } from 'react-dom/client';
import { useAtlasStore } from '../ViewStoreContext';

interface BoundaryProps {
  name: string;
  /** A failed panel is tried again when this changes. */
  resetKey: unknown;
  children: React.ReactNode;
}

interface BoundaryState {
  failed: boolean;
}

class Boundary extends React.Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`[Atlas VTT] ${this.props.name} could not be shown:`, error, info.componentStack);
  }

  override componentDidUpdate(previous: BoundaryProps): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  override render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Keeps an error in one surface of the map UI from unmounting the rest. React removes
 * the whole tree on an uncaught error, and with it the map image and every control.
 * The failed surface shows nothing and is tried again with the next scene, since most
 * failures come from what a scene holds.
 */
export const PanelBoundary: React.FC<{ name: string; children: React.ReactNode }> = ({ name, children }) => {
  const mapPath = useAtlasStore((state) => state.mapPath);
  return <Boundary name={name} resetKey={mapPath}>{children}</Boundary>;
};

/** React logs every caught error itself; the boundaries log theirs with the surface's name, so the root does not. */
export const MAP_UI_ROOT_OPTIONS: RootOptions = { onCaughtError: () => undefined };

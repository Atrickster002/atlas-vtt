import type { ResourceDefinition, ResourceHolder, ResourceViewer, VisibleResource } from './resourceTypes';

/** The resources a viewer sees on a token, in definition order. The only place that filters them. */
export function visibleResources(
  token: ResourceHolder,
  definitions: readonly ResourceDefinition[],
  viewer: ResourceViewer,
): VisibleResource[] {
  const shown: VisibleResource[] = [];
  for (const definition of definitions) {
    if (viewer === 'player' && !definition.visibleToPlayers) continue;
    const value = token.resources?.[definition.key];
    if (!value || !(value.max > 0)) continue;
    shown.push({ definition, value });
  }
  return shown;
}

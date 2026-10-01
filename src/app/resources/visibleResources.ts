import { BAR_SLOTS, MAX_RESOURCES, type ResourceDefinition, type ResourceHolder, type ResourceShape, type ResourceViewer, type VisibleResource } from './resourceTypes';

/** The shape a resource takes on a token: its slot decides, never the resource. */
export function shapeOf(slot: number): ResourceShape {
  return slot < BAR_SLOTS ? 'bar' : 'wheel';
}

/** The resources a viewer sees on a token, in definition order. The only place that filters them. */
export function visibleResources(
  token: ResourceHolder,
  definitions: readonly ResourceDefinition[],
  viewer: ResourceViewer,
): VisibleResource[] {
  const shown: VisibleResource[] = [];
  definitions.slice(0, MAX_RESOURCES).forEach((definition, slot) => {
    if (viewer === 'player' && !definition.visibleToPlayers) return;
    const value = token.resources?.[definition.key];
    if (!value || !(value.max > 0)) return;
    shown.push({ definition, value, slot });
  });
  return shown;
}

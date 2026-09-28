/** Payload carried by each kind of widget animation. */
export interface WidgetAnimationPayloads {
  pulse: { intensity?: number | undefined };
  active: { isActive?: boolean | undefined; duration?: number | undefined };
  'key-held': { keyNumber: number; held: boolean };
}

export type WidgetAnimationType = keyof WidgetAnimationPayloads;

/** Discriminated by `animationType`, so receivers get the matching `data` shape. */
export type WidgetAnimationState = {
  [T in WidgetAnimationType]: {
    sourceViewId: string;
    animationType: T;
    widgetId: string;
    data?: WidgetAnimationPayloads[T] | undefined;
    timestamp: number;
  };
}[WidgetAnimationType];

import React from "react"
import { RotateCcw, SlidersHorizontal } from "lucide-react"
import { DEFAULT_AMBIENT_COLOR } from "../../../lighting/sceneLightingOptions"
import type { SceneLighting } from "../../../types/lightingTypes"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { DropdownSliderRow } from "../primitives/DropdownSliderRow"
import { DropdownToggleRow } from "../primitives/DropdownToggleRow"
import { SegmentedControl } from "../primitives/SegmentedControl"
import { LabelTooltip } from "../primitives/tooltip"

type TimeOfDay = 'day' | 'dusk' | 'night' | 'dark'

const TIMES_OF_DAY: { value: TimeOfDay; label: string; ambient: number }[] = [
  { value: 'day', label: 'Day', ambient: 1 },
  { value: 'dusk', label: 'Dusk', ambient: 0.5 },
  { value: 'night', label: 'Night', ambient: 0.15 },
  { value: 'dark', label: 'Pitch black', ambient: 0 },
]

interface SceneLightingSectionProps {
  lighting: SceneLighting
  onChange: (changes: Partial<SceneLighting>) => void
  onResetExplored: () => void
  /** Opens the panel with the scene's other lighting options. */
  onOpenSettings: () => void
}

/**
 * Scene-wide lighting in the lighting tool's menu: a section with the switch and how dark the
 * scene is, and one with its actions. The players' view of it is session view, not shown here.
 */
export function SceneLightingSection({ lighting, onChange, onResetExplored, onOpenSettings }: SceneLightingSectionProps): React.ReactElement {
  const time = TIMES_OF_DAY.find((stop) => stop.ambient === lighting.ambient)?.value ?? 'custom'
  return (
    <>
      <div className="atlas-dropdown-section atlas-scene-lighting">
        <DropdownToggleRow label="Dynamic lighting" value={lighting.enabled} onChange={() => onChange({ enabled: !lighting.enabled })} />
        {lighting.enabled && (
          <>
            <SegmentedControl<TimeOfDay | 'custom'>
              value={time}
              options={TIMES_OF_DAY}
              ariaLabel="Time of day"
              onChange={(value) => {
                const stop = TIMES_OF_DAY.find((candidate) => candidate.value === value)
                if (stop) onChange({ ambient: stop.ambient })
              }}
            />
            <div className="atlas-scene-lighting__ambient">
              <DropdownSliderRow
                label="Ambient light"
                value={Math.round(lighting.ambient * 100)}
                min={0}
                max={100}
                unit="%"
                onChange={(percent) => onChange({ ambient: percent / 100 })}
              />
              <LabelTooltip label="Ambient colour">
                <input
                  type="color"
                  className="atlas-swatch atlas-swatch--picker"
                  value={lighting.ambientColor ?? DEFAULT_AMBIENT_COLOR}
                  onChange={(event) => onChange({ ambientColor: event.target.value })}
                />
              </LabelTooltip>
            </div>
          </>
        )}
      </div>
      {lighting.enabled && (
        <div className="atlas-dropdown-section">
          <DropdownMenuItem icon={RotateCcw} label="Forget explored areas" onClick={onResetExplored} />
          <DropdownMenuItem icon={SlidersHorizontal} label="Lighting settings…" onClick={onOpenSettings} />
        </div>
      )}
    </>
  )
}

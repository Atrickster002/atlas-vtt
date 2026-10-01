import React, { FC, useId } from "react"
import { Slider } from "./slider"

export interface DropdownSliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (value: number) => void
}

/** A menu row with a slider: its name and value on the menu's text edge, the track across the menu. */
export const DropdownSliderRow: FC<DropdownSliderRowProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "px",
  onChange,
}) => {
  const labelId = useId()
  return (
    <div className="atlas-dropdown-slider-row">
      <div className="atlas-dropdown-slider-row__head">
        <span id={labelId} className="atlas-dropdown-label">{label}</span>
        <span className="atlas-dropdown-slider-row__value">{value}{unit}</span>
      </div>
      <Slider
        aria-labelledby={labelId}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v: number[]) => onChange(v[0] ?? value)}
      />
    </div>
  )
}

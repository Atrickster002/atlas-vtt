"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "../../../../utils/cn"
import "./slider.css"

interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  /** Names each thumb of a range slider for assistive technology, e.g. ["Minimum CR", "Maximum CR"]. */
  thumbLabels?: readonly string[]
  /** Reads a thumb's value aloud as the slider shows it, e.g. 0.25 as "1/4". */
  getValueText?: (value: number) => string
}

/** One thumb per value: a single value is a plain slider, two values select a range. */
const Slider = React.forwardRef<React.ComponentRef<typeof SliderPrimitive.Root>, SliderProps>(
  ({ className, "aria-labelledby": labelledBy, thumbLabels, getValueText, ...props }, ref) => {
    const values = props.value ?? props.defaultValue ?? [props.min ?? 0]
    return (
      <SliderPrimitive.Root
        ref={ref}
        className={cn("slider-root", className)}
        {...props}
      >
        <SliderPrimitive.Track className="slider-track">
          <SliderPrimitive.Range className="slider-range" />
        </SliderPrimitive.Track>
        {values.map((value, index) => (
          <SliderPrimitive.Thumb
            key={index}
            className="slider-thumb"
            aria-labelledby={thumbLabels?.[index] === undefined ? labelledBy : undefined}
            aria-label={thumbLabels?.[index]}
            aria-valuetext={getValueText?.(value)}
          />
        ))}
      </SliderPrimitive.Root>
    )
  },
)
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }

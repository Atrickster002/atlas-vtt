import React, { useState } from "react"
import { BrickWall, Flame, FlameKindling, Lamp, Lightbulb, Moon, MousePointer2, Pencil, Sparkles } from "lucide-react"
import { useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { chosenLightPreset } from "../../../lighting/lightPresetChoice"
import { useMapLightPresets } from "../../../react/hooks/useMapLightPresets"
import type { LightKind } from "../../../types/lightingTypes"
import type { WallToolMode, WallToolSubMode } from "../../../tools/WallTool"
import { DropdownMenuItem, type DropdownMenuItemProps } from "../primitives/DropdownMenuItem"
import { SceneLightingSection } from "./SceneLightingSection"
import { ToolGroup, type ToolGroupControls } from "./ToolGroup"
import { lightingToolFace } from "./toolFaces"
import { useEmitViewEvent } from "./useEmitViewEvent"

type RowIcon = DropdownMenuItemProps['icon']

/** What the tool does with a click. */
const SUB_MODES: readonly { value: WallToolSubMode; icon: RowIcon; label: string }[] = [
  { value: 'draw', icon: BrickWall, label: 'Draw walls' },
  { value: 'place-light', icon: Lightbulb, label: 'Place lights' },
]

const DRAW_MODES: readonly { value: WallToolMode; icon: RowIcon; label: string }[] = [
  { value: 'point-to-point', icon: MousePointer2, label: 'Point to point' },
  { value: 'freeform', icon: Pencil, label: 'Freehand' },
]

/** A row's icon for each kind of light a preset can be. */
const KIND_ICONS: Record<LightKind, RowIcon> = {
  candle: Flame,
  torch: FlameKindling,
  lantern: Lamp,
  magical: Sparkles,
  darkness: Moon,
  custom: Lightbulb,
}

/** Walls, lights and the scene's lighting in one place. DM only, behind WALLS_AND_LIGHTING_ENABLED. */
export function LightingToolGroup({ activeTool, selectTool, menuOpen, toggleMenu, closeMenu }: ToolGroupControls): React.ReactElement {
  const hotkeyLabel = useHotkeyLabels()
  const emit = useEmitViewEvent()
  const lighting = useAtlasStore((state) => state.lighting)
  const setSceneLighting = useAtlasStore((state) => state.setSceneLighting)
  const setSceneLightingPanelOpen = useAtlasStore((state) => state.setSceneLightingPanelOpen)
  const [subMode, setSubMode] = useState<WallToolSubMode>('draw')
  const [drawMode, setDrawMode] = useState<WallToolMode>('point-to-point')
  const presets = useMapLightPresets()
  // The chosen preset's id; the collection's torch until one is chosen, and again once the collection no longer has it.
  const [presetId, setPresetId] = useState<string | null>(null)
  const preset = chosenLightPreset(presets, presetId)
  const face = lightingToolFace(activeTool)

  return (
    <ToolGroup
      face={face}
      shortcut={hotkeyLabel('wall')}
      menuLabel="Lighting options"
      menuOpen={menuOpen}
      onSelect={() => selectTool(face.tool)}
      onMenuToggle={toggleMenu}
    >
      <div className="atlas-dropdown-section">
        {SUB_MODES.map(({ value, icon, label }) => (
          <DropdownMenuItem
            key={value}
            icon={icon}
            label={label}
            // The tool's key selects it with what it did last.
            {...(value === subMode && { shortcut: hotkeyLabel('wall') })}
            isActive={face.isActive && value === subMode}
            onClick={() => {
              setSubMode(value)
              emit('wall-submode-changed', value)
              selectTool('wall')
            }}
          />
        ))}
      </div>

      <div className="atlas-dropdown-section">
        {subMode === 'draw' ? DRAW_MODES.map(({ value, icon, label }) => (
          <DropdownMenuItem
            key={value}
            icon={icon}
            label={label}
            isActive={value === drawMode}
            onClick={() => {
              setDrawMode(value)
              emit('wall-mode-changed', value)
            }}
          />
        )) : presets.map(({ id, name, kind }) => (
          <DropdownMenuItem
            key={id}
            icon={KIND_ICONS[kind]}
            label={name}
            isActive={id === preset.id}
            onClick={() => {
              setPresetId(id)
              emit('lighting-preset-changed', id)
            }}
          />
        ))}
      </div>

      <SceneLightingSection
        lighting={lighting}
        onChange={setSceneLighting}
        onResetExplored={() => {
          emit('lighting-reset-explored')
          closeMenu()
        }}
        onOpenSettings={() => {
          setSceneLightingPanelOpen(true)
          closeMenu()
        }}
      />
    </ToolGroup>
  )
}

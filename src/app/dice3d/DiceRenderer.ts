/**
 * The dice renderer: **real light instead of computed tones.**
 *
 * A software version painted every face with a gradient and a formula
 * highlight; it read as cardboard, not as a die. What gives a die its look
 * cannot be painted per face:
 *
 * 1. **Reflections of the surroundings.** A studio environment
 *    (`RoomEnvironment`) stands behind the material as its mirror world.
 * 2. **The chamfer as a body.** The edge is really ground off: a narrow strip
 *    of geometry that catches the light differently from the face, anew at
 *    every turn (`dieMesh.ts`).
 * 3. **The cut numeral.** A bump map sinks the number into the material.
 * 4. **A real cast shadow.** The die casts it on the table, with a soft edge,
 *    in its own shape; no blob underneath.
 *
 * The math stays where it is: `dieGeometry.ts` supplies the bodies,
 * `dieMotion.ts` the path. This file only draws.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import type { DieSides } from './dieGeometry';
import { dieAssets } from './dieMesh';
import type { DieAnim } from './dieMotion';
import { FLOOR_Y } from './dieTour';
import { chainLengthFor, GhostTrail } from './ghostTrail';
import { landingSparks, wallSparks, type Crit } from './impactSparks';
import { Sparks } from './sparks';
import { STAGE_FOV, StageCamera } from './stageCamera';

export interface StageDie {
  anim: DieAnim;
  sides: DieSides;
  /** Rolled for an explosion: not on the table until it is thrown. */
  waits?: boolean;
  /** The die exploded: it lands with this burst, whatever the roll as a whole is. */
  burst?: Crit;
}

const KEY_INTENSITY = 0.95;

/** Ink colour as a number: the canvas knows no CSS variables. */
const INK = 0x16130f;

/**
 * **The shadow gets softer the higher the die is.**
 *
 * There once was a round blob underneath. It did what it should, show contact
 * with the ground, and looked like what it was: a circle under an icosahedron.
 * A shadow has the shape of its body, otherwise it is decoration.
 *
 * So it stays a cast shadow (VSM, soft edge, true silhouette), and the missing
 * information about height comes from the **blur**: just above the table the
 * core is narrow and dark, high up it dissolves into a breath. That is what a
 * penumbra does, and it costs two numbers per frame.
 */
const SHADOW_SHARP = { blur: 13, opacity: 0.3 };
const SHADOW_SOFT = { blur: 34, opacity: 0.14 };

/**
 * **The shadow follows the paper, the die does not.**
 *
 * The die keeps its colours in a dark theme, but the shadow is not a thing: it
 * is the mark the thing leaves on the page, and the page does change colour.
 * Two values change with it:
 *
 * - **The colour** goes to black instead of ink. Ink on a dark page barely
 *   differs from the page: a shadow you would have to measure to find.
 * - **The opacity** rises, because the way down is shorter. Even black at one
 *   and a half times the opacity takes less from the dark page than the light
 *   case takes from the light one; more would be a hole in the paper.
 */
const NIGHT_SHADOW_GAIN = 1.5;

function nightSheet(canvas: HTMLCanvasElement): boolean {
  return canvas.ownerDocument.body.classList.contains('theme-dark');
}

/**
 * **Where the key light stands.**
 *
 * It once hung almost straight above the table, so the shadow would lie
 * *under* the die rather than beside it. That was true, and it was why none of
 * it could be seen: at 75° elevation it vanished entirely under the body that
 * casts it. A shadow hidden by its own body is no shadow.
 *
 * Now it stands at a good 60°: flat enough that the silhouette falls on the
 * table beside the die and its shape can be read, steep enough that it clings
 * to the body instead of running across the sheet.
 *
 * **And it stands back left, not front left.** The camera looks at the table
 * from above and in front; on screen, depth (-z) is *up*. A light from the
 * front threw the shadow **up**, behind the die, but a view from above calls for
 * a shadow falling down. So the light moves over the die to the other side:
 * from back left, shadow to front right, lower right on screen.
 *
 * The fill light pays back what that costs: the faces turned to the viewer
 * only get grazing light from the key, and without light from the front they
 * would be too dark for their numerals.
 */
const KEY_AT = [-1.7, 6.0, -1.7] as const;

export class DiceRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly view = new StageCamera();
  private readonly key: THREE.DirectionalLight;
  private readonly pmrem: THREE.PMREMGenerator;
  /** The baked reflection: its own render target that nothing else clears. */
  private readonly envRT: THREE.WebGLRenderTarget;
  private meshes: THREE.Mesh[] = [];
  private readonly trails: GhostTrail;
  private readonly sparks: Sparks;
  /** Who has landed already: the landing fires only once. */
  private landed: boolean[] = [];
  private readonly floorMat: THREE.ShadowMaterial;
  private lastTime: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    // VSM: the only shadow type with a truly soft edge; for a handful of dice
    // its cost does not matter.
    this.renderer.shadowMap.type = THREE.VSMShadowMap;

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    // The mirror world is baked **once**; the room it comes from has nothing
    // left to do and gives its meshes back right away.
    const room = new RoomEnvironment();
    this.envRT = this.pmrem.fromScene(room, 0.04);
    room.dispose();
    this.scene.environment = this.envRT.texture;

    this.key = new THREE.DirectionalLight(0xfff0da, KEY_INTENSITY);
    this.key.position.set(...KEY_AT);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    // The shadow frame must hold the **whole** stage, or a die at the wall
    // loses its shadow.
    this.key.shadow.camera.left = -4.2;
    this.key.shadow.camera.right = 4.2;
    this.key.shadow.camera.top = 4.2;
    this.key.shadow.camera.bottom = -4.2;
    this.key.shadow.camera.near = 0.5;
    this.key.shadow.camera.far = 14;
    this.key.shadow.radius = SHADOW_SHARP.blur;
    this.key.shadow.blurSamples = 24;
    this.key.shadow.bias = -0.0004;
    this.scene.add(this.key);

    const fill = new THREE.DirectionalLight(0xd8c4a0, 0.62);
    fill.position.set(2.4, 1.2, 2.6);
    this.scene.add(fill);

    // The table: invisible except for the shadow falling on it.
    this.floorMat = new THREE.ShadowMaterial({ color: INK, opacity: SHADOW_SHARP.opacity });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.trails = new GhostTrail(this.scene);
    this.sparks = new Sparks(this.scene, FLOOR_Y + 0.02);

    // **The canvas is wiped before anyone sees it.**
    //
    // Baking the mirror world draws, and it draws bright: `RoomEnvironment` is
    // a white room. Whatever of it stays in the framebuffer stands there until
    // the first real frame covers it, and between setup and first frame there
    // is at least one layout pass. That was the **white box with sharp
    // corners** flashing over the sheet on the second throw: not the paper, not
    // the mask, but the leftovers of the oven.
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
  }

  /**
   * One mesh per planned die; dice of the same kind share geometry and
   * material. Each gets a chain of ghosts, shorter the more dice there are
   * (`chainLengthFor`).
   */
  setPlan(sides: DieSides[]): void {
    for (const mesh of this.meshes) this.scene.remove(mesh);
    this.trails.clear();
    this.landed = sides.map(() => false);

    const chainLength = chainLengthFor(sides.length);

    this.meshes = sides.map((s) => {
      const assets = dieAssets(s);
      const mesh = new THREE.Mesh(assets.geometry, assets.material);
      mesh.castShadow = true;
      mesh.visible = false;
      this.scene.add(mesh);
      this.trails.addChain(assets, chainLength);
      return mesh;
    });
  }

  /** Fits the camera to the canvas and the key light and its shadow frame to the stage. */
  private fitToCanvas(focus: number, halfWidth: number | undefined): void {
    this.view.fit(focus, halfWidth);
    const reach = this.view.reach;
    const focusZ = this.view.focusZ;
    const [halfX, halfZ] = this.view.stage();

    // The shadow needs a frame around the whole stage, or a body at the wall
    // loses its shadow.
    const frame = Math.max(halfX, halfZ) + 1;
    this.key.shadow.camera.left = -frame;
    this.key.shadow.camera.right = frame;
    this.key.shadow.camera.top = frame;
    this.key.shadow.camera.bottom = -frame;
    this.key.shadow.camera.far = 14 * reach;
    this.key.position.set(KEY_AT[0] * reach, KEY_AT[1] * reach, KEY_AT[2] * reach + focusZ);
    this.key.target.position.set(0, 0, focusZ);
    this.key.target.updateMatrixWorld();
    this.key.shadow.camera.updateProjectionMatrix();
  }

  /** The stage as the throw knows it: half width and half depth in world units. */
  stage(): readonly [number, number] {
    return this.view.stage();
  }

  /**
   * Sizes the canvas and fits the camera: to `halfWidth` world units either
   * side of the centre, by default the whole stage the dice bounce around in.
   */
  setSize(width: number, height: number, dpr: number, focus = 0.5, halfWidth?: number): void {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.view.setAspect(width / height);
    this.fitToCanvas(focus, halfWidth);
    // Sparks are sized in pixels, not world units; the conversion depends on
    // exactly this height.
    this.sparks.setViewport(height * dpr, STAGE_FOV);
  }

  /** One frame: take the poses from the simulation and draw. */
  render(dice: StageDie[], emphasis: number, crit: Crit = null): void {
    const now = performance.now() / 1000;
    const dt = this.lastTime === null ? 0 : Math.min(0.05, now - this.lastTime);
    this.lastTime = now;

    for (let i = 0; i < this.meshes.length; i++) {
      const die = dice[i];
      const mesh = this.meshes[i]!;
      if (die === undefined) continue;
      const anim = die.anim;
      // The waiting die lies visibly in place; the delay hides nothing any
      // more, it is the stillness before the push. Only a die rolled for an
      // explosion is not there yet: it exists once the die before it burst.
      mesh.visible = !(die.waits === true && anim.phase === 'throw' && anim.delay > 0);
      if (!mesh.visible) continue;
      mesh.position.set(anim.p[0], anim.p[1], anim.p[2]);
      mesh.quaternion.set(anim.q.x, anim.q.y, anim.q.z, anim.q.w);
      mesh.scale.setScalar(anim.radius);

      const hit = wallSparks(anim);
      if (hit !== null) this.sparks.emit(hit);
      if (anim.impact?.kind === 'settle' && !this.landed[i]) {
        this.landed[i] = true;
        this.sparks.emit(landingSparks(anim, die.burst ?? crit));
      } else if (anim.phase === 'throw' && anim.t < 0.2) {
        this.landed[i] = false;
      }

      this.trails.update(i, mesh, anim);
    }

    // As the dice come to rest the light swells briefly: the gleam of the result.
    this.key.intensity = KEY_INTENSITY * (1 + 0.22 * emphasis);

    // **Penumbra.** The highest body decides how soft the shadow is drawn: a
    // shadow has one softness, not two, and the flying die is the one being
    // watched.
    let height = 0;
    for (const die of dice) {
      height = Math.max(height, (die.anim.p[1] - die.anim.floor) / (die.anim.radius * 2.6));
    }
    const softness = Math.min(1, Math.max(0, height));
    this.key.shadow.radius = SHADOW_SHARP.blur + (SHADOW_SOFT.blur - SHADOW_SHARP.blur) * softness;
    // Read on every frame: the renderer is pooled and outlives a theme switch.
    const night = nightSheet(this.renderer.domElement);
    const shadowGain = night ? NIGHT_SHADOW_GAIN : 1;
    this.floorMat.color.setHex(night ? 0x000000 : INK);
    this.floorMat.opacity =
      (SHADOW_SHARP.opacity + (SHADOW_SOFT.opacity - SHADOW_SHARP.opacity) * softness) * shadowGain;

    this.placeCamera(dice, dt);
    this.sparks.step(dt);

    this.renderer.render(this.scene, this.view.camera);
  }

  /** Shakes the camera by the strongest wall hit of this frame. */
  private placeCamera(dice: StageDie[], dt: number): void {
    let bang = 0;
    for (const die of dice) {
      if (die.anim.impact?.kind === 'wall') bang = Math.max(bang, die.anim.impact.strength);
    }
    this.view.place(bang, dt);
  }

  /**
   * **The stage is cleared, not torn down.**
   *
   * There once was a `dispose()` here that gave the WebGL context back with
   * `forceContextLoss()`, because every throw built its own stage. The idea was
   * right, the effect was not: an abandoned context **keeps counting** until
   * garbage collection gets round to it. Measured in WebKit, twenty throws in
   * a row: from the seventeenth on, every single one logged "There are too many
   * active WebGL contexts on this page, the oldest context will be lost", and
   * right after it "loseContext: context already lost": the browser had
   * reclaimed the context itself before we could give it back. Each of those
   * contexts holds a 2048 shadow map and a baked reflection. On a phone the
   * series does not end with a warning but with the system reloading the page
   * under memory pressure, mid-game.
   *
   * So no context is thrown away any more. The stage is cleared and handed on
   * to the next throw (`stagePool.ts`): the pool grows to as many contexts as
   * were ever on screen *at the same time*.
   */
  reset(): void {
    this.setPlan([]);
    this.sparks.clear();
    this.view.resetShake();
    this.lastTime = null;
    // What was last in the framebuffer belonged to the previous throw. The
    // borrowed canvas starts empty, or its last frame flashes up briefly.
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
  }
}

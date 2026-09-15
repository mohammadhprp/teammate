# Entity art plan — realistic developer + robot models

Status: **plan only, no code written**. This document is the executable brief for
the entity visual redesign against
[`docs/reference/entities-reference.png`](reference/entities-reference.png).

Scope: `src/entities/developer.ts`, `src/entities/robot.ts`,
`src/entities/agent.ts`, `src/core/palette.ts`, `src/core/textures.ts`,
`src/core/engine.ts` and one new core module. Everything else is read-only.

Grounded in: `entities/developer.ts`, `entities/robot.ts`, `entities/agent.ts`,
`core/palette.ts`, `core/textures.ts`, `core/engine.ts`, `core/batch.ts`,
`world/props.ts`, `world/ship.ts`, `world/layout.ts`, `game/player.ts` and the
reference sheet (viewed). Line numbers below are from that reading.

---

## 1. The target look, decoded

The sheet is a **stylized "toy/Pixar" render**, not photoreal. "More realistic"
here means *physically believable surfaces and proportions*, not photogrammetry:
soft matte fabric with micro-grain, gentle bevels that catch a highlight, bolder
mechanical panel breaks with recessed hardware, and soft studio contact shadows.
The single biggest tell between the render and the current code is that the code
has **no surface detail at all** — every material is a flat `MeshStandardMaterial`
with a colour, a roughness and a metalness (`developer.ts:20-35`,
`robot.ts:40-54`, `palette.ts:53-80`) and the ship contains **zero**
`normalMap` / `roughnessMap` / `aoMap` usages (verified by grep).

**Developer (top row).** Young man; thick dark curly hair; round black-rimmed
glasses over visible eyes; charcoal hoodie; dark joggers; black low-top sneakers
with white soles. Seated legs-folded in a **smooth white/cream egg-shaped lounge
pod** with a visible horizontal shell seam, a faint cyan light strip low on the
pod, small rear nozzles and a rounded rear hatch panel. Silver laptop, circular
logo. Five orbit views + head close-up + accessory details.

**Robot (middle + bottom rows).** Small tracked base: two tank treads with
**clearly visible road wheels and tread links**. Cream/off-white boxy chassis
with rounded edges, dark mechanical seams and side panels, a **front access
hatch bearing a triangle "▷" icon**, vents, screws, small hatches. Short neck,
a binocular camera head of **two large cylindrical lens barrels** with dark
glass, metal rings, a dark band and a small antenna. Role variants share the
base and add a **coloured side panel + a coloured role badge on the front**
(gear / `</>` / check / flask) and a coloured antenna tip.

---

## 2. Gap analysis (current code vs sheet)

### 2.1 Developer — `src/entities/developer.ts`

| # | Gap | Evidence | Severity |
| - | --- | --- | --- |
| D1 | **Pod is a box, not an egg.** Shell is `RoundedBoxGeometry(3.5, 1.35, 3.1)` (`:54`) with a separate protruding torus "lip" on top (`:60-64`). The sheet has one continuous smooth egg shell with a seam, no lip ring. | `:54`, `:60-64` | High |
| D2 | **No shell seam, rear hatch or rear nozzles.** The nozzle loop (`:100-107`) places two nozzles at `z = -0.5` on the *sides* under the box; the sheet has small nozzles/hatch on a rounded rear panel with a seam. | `:100-110` | High |
| D3 | **Low cyan strip is a full torus ring** at `y = 0.2` (`:95-99`), not a subtle low strip as in the sheet. | `:95-99` | Medium |
| D4 | **Hair is a uniform ring cloud.** `ringSpec` lays curls in five concentric rings (`:245-264`), producing a bowl of evenly spaced balls. The `back` term computed at `:255` is then `void`ed (`:256`) — dead math that was presumably meant to thin the back. The sheet's hair is an uneven, clumped curly mass with a clean silhouette. | `:242-284` | High |
| D5 | **Eyes are invisible behind the lenses.** Eyes are `0.065` spheres (`:219-221`) under lenses with `opacity: 0.82` (`:211-217`) and a torus rim (`:222-224`). The sheet's head close-up reads *eyes behind round black frames*. | `:211-232` | Medium |
| D6 | **Flat materials, no fabric/skin response.** Local `std()` (`:20-22`) duplicates the same three numbers over and over; hoodie `roughness 0.82` and skin `0.62` with no sheen, no micro-normal, no contact AO. | `:20-35` | High |
| D7 | **Local material library, not the shared one.** `developer.ts` defines its own `mat` (`:24-35`) instead of `M`, contrary to the cached-materials convention in `AGENTS.md`. | `:24-35` | Low |
| D8 | **Legs/pose approximate; sneakers are 4 boxes + 3 "laces".** Laces are full-width `BoxGeometry` bars (`:140-145`), no toe cap, no tongue. | `:123-146` | Medium |
| D9 | **No named parts for W-11.** Hands are anonymous meshes inside a loop (`:168-181`); there is nothing to drive typing with. | `:168-181` | Medium |
| D10 | **Mesh count ≈ 116** for the avatar (≈57 of them hair balls). Every one is a draw call; entities are never batched (`core/batch.ts:7-12` explicitly excludes moving objects). | counted | Medium |

### 2.2 Robot — `src/entities/robot.ts`

| # | Gap | Evidence | Severity |
| - | --- | --- | --- |
| R1 | **Road wheels are bare cylinders.** Wheels are `CylinderGeometry(0.15, 0.15, 0.36)` in `M.black` with no hub, no tyre/shoulder break (`:19`, `:87-93`). They protrude ~0.2 outboard of the track shell but read as flat discs. The sheet shows chunky road wheels with a light hub. | `:19`, `:87-93` | High |
| R2 | **Tread links don't wrap the belt.** Treads are `BoxGeometry(0.36, 0.09, 0.12)` placed at `x = 0` on the top and bottom faces only, 7 each (`:94-101`). From the side the belt reads as a smooth rounded box. The sheet's belt is linked around the whole loop. | `:94-101` | High |
| R3 | **The front hatch is a flat floating badge, not a hatch.** A `0.9 × 0.4 × 0.06` plate (`:130-132`) with a zero-thickness `PlaneGeometry` badge on top (`:133-136`), no recess, no frame, no triangle. The sheet's body-detail close-up is a distinct recessed hatch with the triangle icon and screws. | `:129-136` | High |
| R4 | **`none` role icon draws nothing.** `roleIconTexture` has no branch for `'none'` (`textures.ts:245-311`), so the base/Team Mate badge is blank and Team Mate gets a floating torus crest instead (`robot.ts:285-295`). The sheet's default icon is the **triangle ▷ on the hatch**. | `textures.ts:245-311`, `robot.ts:285-295` | High |
| R5 | **Head reads as one cream drum.** Barrels are `M.darker` (`:222`), rings `M.steel` (`:226`), one shared dark band (`:206-208`); barrels are `r = 0.155` against a `0.25` housing (`:26-28`). The sheet's barrels dominate and carry a cream outer shell, a metal ring and dark glass. | `:195-238` | Medium |
| R6 | **Surface detail is sparse and flat.** Vents are 4 tiny `0.36 × 0.04 × 0.03` bars (`:37`, `:153-157`); corner screws are 8 `0.032` cylinders (`:158-169`). No panel lines between the chassis, body and shoulders, no AO in the seams. | `:152-172` | Medium |
| R7 | **Flat materials again.** `M.hullSoft` / `M.dark` / `M.darker` / `M.steel` are all `MeshStandardMaterial` with no maps (`palette.ts:66-80`). | `palette.ts:66-80` | High |
| R8 | **Mesh count ≈ 80 per robot** (36 track + 5 chassis + 3 body/plate/badge + 6 side + 13 vents/screws/seam + 1 ring + 16 head/antenna). With `N` robots that is `80N` draw calls on top of the measured baseline (~294 in `PLAN.md` W-18). | counted | High |
| R9 | **Dead code.** `iconMesh` is assigned and immediately `void`ed (`:256`, `:276-277`). | `:256`, `:276-277` | Low |
| R10 | **The model floats.** `Agent` sets `root.position.y = 0.42` (`agent.ts:132`, `:274`) while the track shell bottom is at local `y ≈ 0.01` (`:18-21`, `:81`) and the floor top is `y = 0` (`ship.ts:367`, `:596`, `:616`). The treads therefore hover ≈0.42 above the floor and the "floor" status ring sits at ≈0.45 (`:184-185`), not on the floor. Either this is a deliberate hover and the sheet's ground contact is wrong, or it is a long-standing offset. **Verify before changing** — it may exist to dodge floor z-fighting with the ring. | `agent.ts:132/274`, `robot.ts:184-185`, `ship.ts:367` | Medium |

### 2.3 Shared materials, textures, lighting

| # | Gap | Evidence | Severity |
| - | --- | --- | --- |
| S1 | No procedural surface maps exist (`normalMap`/`roughnessMap`/`aoMap` grep = 0 hits). | grep | High |
| S2 | No environment map. `MeshStandardMaterial.metalness` with no `envMap` reflects only the punctual lights, so `M.metal` (`metalness 0.85`, `palette.ts:75`), `M.steel` (`0.8`) and the chrome laptop (`developer.ts:32`) read dark and flat. | `engine.ts:56-81` | High |
| S3 | Shadows are one 2048 shadow map over a **140-unit** orthographic frustum (`engine.ts:62-74`) that follows the player. A 1.7-unit robot gets a handful of shadow texels, so there is no contact shadow. | `engine.ts:62-74`, `:99-103` | Medium |
| S4 | `bob` is applied to the whole model (`agent.ts:284`), so the tracks lift with the body — physically wrong for a tracked vehicle and it compounds R10. | `agent.ts:284` | Medium |
| S5 | Bloom threshold/rules are tuned for the ship (`engine.ts:86-91`); cream is matte so it will not bloom, but emissive lens/ring must stay the only entity glow or the state read washes. | `engine.ts:86-91` | Low |

### 2.4 What already matches (do not rebuild)

- Robot part roles, the shared base + accent-panel + badge scheme and the four
  role accents/icons (`robot.ts:72-172`, `agent.ts:59-71`) already match the
  sheet's role row.
- The developer's colour palette, glasses, hoodie, laptop, folded-leg silhouette
  and oversized head are directionally right (`developer.ts:11-18`, `:183-240`).
- The state language (posture + lens + ring, `agent.ts:34-57`) is the app's own
  layer and the sheet is silent on it — it must survive.

---

## 3. Options A vs B

### A — Improve the in-repo procedural models and materials

Keep canvas/procedural generation, upgrade geometry, proportions and the
material library, add procedural normal/roughness/AO maps and a contact shadow.

### B — Author glTF/DRACO assets with an art pipeline

Model both entities in a DCC tool, export named-node glTF + baked PBR maps, ship
DRACO-compressed binaries, load with `GLTFLoader` + `DRACOLoader`.

| Criterion | A — procedural (in repo) | B — glTF/DRACO pipeline |
| --- | --- | --- |
| Fidelity ceiling | High for the **robot** (hard-surface, mechanical, all achievable in code). Medium for the **character**: sculpted hair clumps and facial forms are the hard part; a good stylized read is reachable but a photoreal face is not. | High for both; the only route to a genuinely sculpted face/hair and baked-cavity AO. |
| Effort | Moderate, incremental, no tooling. Ships in reviewable slices. | High: DCC authoring, export conventions, asset versioning, loader wiring, CI for assets, DRACO decoder hosting. Needs an artist this project does not have. |
| Runtime cost | Geometry grows by maybe 20–40% on two small models; three is already fine with rounded boxes. Add ~4 small procedural maps (128–256 px) and one PMREM env. No load-time decode. | Lower vertex count after DRACO and fewer materials if authored merged, but pays a load/decode step + wasm, plus a texture memory budget (1024s) that the runtime currently does not have at all. |
| Animate / name parts | **Direct TS object references** — `RobotModel.head/neck/leftWheels/rightWheels/ringMat/lensMat/badge` (`robot.ts:56-70`) and `DeveloperAvatar.body/head/laptopScreen/podLight` (`developer.ts:37-45`). The whole animation system drives these (`agent.ts:273-305`, `player.ts:154-191`). Extend additively. | Needs a naming contract, a lookup layer and either an `AnimationMixer` or a rig. Baked clips fight the state-driven `POSTURE` table; you would end up keeping procedural bone animation anyway. |
| Bundle size | +tens of KB of TS. Every texture stays generated at runtime → **0 bytes shipped**. | Realistically 1–10 MB of mesh + texture assets (+ ~0.2 MB DRACO wasm). |
| "No art files" constraint | **Preserved.** | **Explicitly revised** — `README.md:1-9`, `:93-95` and `AGENTS.md:4-5` state the no-art-files rule as a design decision, so B is a product change, not a refactor. |
| Fallback / offline | Trivially deterministic, no network, testable in Node. | Needs a procedural fallback anyway for the load step, i.e. you maintain both. |

### Recommendation: **A**, staged, with one explicit revisit trigger

Do A. It preserves the project's defining constraint, reuses the app's existing
part-reference animation contract instead of fighting it, and the entity with
the most surface area for improvement — the robot — is pure hard-surface work
that code does well. The character's *stylized toy* target is also not what a
photoreal asset pipeline buys you.

**What would change the recommendation:** if, after step 5 (the character pass),
the developer judges the head/hair does not pass against the sheet and the
product goal becomes a *sculpted* character, revisit B **for the head + hair
only** as a single small mesh, keeping the rest procedural. Do not run two full
pipelines; mixed fidelity is worse than either. Escalate that decision to the
developer rather than making it inside a step.

---

## 4. Realism levers (the A plan uses all five)

1. **Proportions / silhouette.** Fix the pod to a single egg shell with a seam;
   rebuild the hair into clumped masses; make the robot barrels larger and the
   belt linked and wheeled. Silhouette is what reads from the ship camera at
   7.4 units (`player.ts:12-16`), before any map detail.
2. **Materials (roughness / metalness / sheen / clearcoat).** Add hero surfaces
   to `M`: fabric hoodie as `MeshPhysicalMaterial` with `sheen` (Standard has no
   sheen), soft skin with a touch of sheen, matte cream plastic (roughness ~0.6,
   metalness 0), rubber belt, brushed steel, near-black matte frame and a real
   lens glass. Keep the ship's existing `M` materials byte-identical.
3. **Procedural normal / roughness / AO maps.** New `core/surfaces.ts` generating
   small `CanvasTexture`s once and caching by key: isotropic micro-noise normal,
   fabric weave normal, panel-line normal, roughness variation, cavity/AO and a
   radial contact-shadow blob. 128–256 px is plenty at entity scale.
4. **Bevels and surface detail.** Bump `RoundedBoxGeometry` segments/radius on
   hero pieces, add explicit recessed panel lines and darkened seams at
   junctions, add hub caps to the road wheels, and replace the flat badge with a
   recessed hatch.
5. **Lighting / shadows.** Add a small PMREM environment so metal and glass
   finally have something to reflect, and add a contact-shadow blob under each
   entity. Both are named in §5.

**No-art-files constraint: preserved.** Every new map and the environment are
generated at runtime. The `▷` triangle icon joins `roleIconTexture` as another
canvas drawing, exactly like the existing four.

---

## 5. File-by-file plan

### New: `src/core/surfaces.ts`

Procedural surface-map factory + the contact-shadow helper. Kept out of
`textures.ts` because `textures.ts` is documented as *data-driven displays*
(`textures.ts:3-8`); surfaces are reusable across entities **and** props, which
serves W-13.

- `microNormal(size = 128, strength = 1): THREE.Texture` — isotropic noise →
  normal map. Cache by key.
- `fabricNormal(size = 256): THREE.Texture` — woven cross-hatch → normal.
- `panelNormal(size = 256, lines: number[]): THREE.Texture` — horizontal/vertical
  groove normals for chassis and body breaks.
- `roughnessVariation(size = 128, base: number, spread: number): THREE.Texture`.
- `cavityAOMap(size = 256, inset = 0.08): THREE.Texture` — dark vignette/groove
  AO. Must confirm in three r186 whether `aoMap` consumes `uv` channel 0 or a
  second UV set; the safe fallback is to **multiply the AO into the albedo `map`**
  and skip `aoMap` entirely.
- `contactShadowTexture(): THREE.Texture` — radial alpha gradient.
- `contactShadow(radius, opacity): THREE.Mesh` — flat, `depthWrite: false`,
  `transparent`, slight `polygonOffset`, `renderOrder` set, so it never z-fights
  the floor.
- All factories cached by key; all tags set for correct color space
  (normal/roughness/AO maps = `NoColorSpace`, not sRGB).

### `src/core/textures.ts`

- Add a `'triangle'` branch to `RoleIcon` and `roleIconTexture`
  (`:245-311`) and make it the **default** icon, so `'none'` renders the sheet's
  `▷` on the hatch instead of nothing. This closes R4 and lets Team Mate keep a
  real hatch icon.

### `src/core/palette.ts`

- Additive only: `M.fabric` (`MeshPhysicalMaterial`, sheen), `M.skin` (soft,
  subtle sheen), `M.plasticCream` (matte entity cream), `M.trackRubber`,
  `M.frameDark`, `M.lensGlass`, `M.contactShadow` (if the helper lives here).
  Attach the `surfaces.ts` maps.
- Do **not** edit the existing `hull/hullSoft/dark/darker/steel/rubber/black`
  values — the whole ship depends on them and `batch.ts` keys buckets by
  material object identity (`batch.ts:14-25`), so mutating a shared material
  would silently change every batched prop.

### `src/entities/robot.ts`

- **Base:** give wheels a light hub inset (small `M.steel` cap) and a slightly
  squashed tyre read; keep the 3-wheel-per-side rhythm; wrap tread links around
  the belt (top, bottom, front, rear) instead of top/bottom only; add a sprocket
  disc at each end.
- **Front hatch:** replace the plate + floating badge (`:129-136`) with a
  recessed hatch frame (a shallow inset ring/box) and seat the badge inside it.
  Default icon = `triangle`.
- **Body detail:** widen and deepen the vents, add explicit dark panel lines
  between chassis/body/shoulder, add a rounded rear hatch panel and seam
  (matching the sheet's back view).
- **Head:** enlarge barrels relative to the housing, give the barrel an outer
  cream shell with a `M.steel` ring and dark glass, keep the dark band and add
  the compact stereo mount the sheet shows.
- **Materials:** switch `M.hullSoft` → `M.plasticCream`, `M.black`/`M.darker`
  tracks → `M.trackRubber`/`M.frameDark`, lens to `M.lensGlass`.
- **Perf:** merge non-animated pieces per material into fewer meshes (the head is
  the only animated sub-tree). Build geometry **once at module load** and share
  it across robots; only the accent/lens/ring materials are per-robot clones.
  Target ≤ ~12 meshes/robot, down from 80 (R8).
- **Contract:** keep `RobotModel` (`:56-70`) and extend additively with what
  W-12 needs: `body` (suspension group), `treads`/`hubs` if useful. Remove the
  dead `iconMesh` (R9) as part of touching `setIcon`.

### `src/entities/developer.ts`

- **Pod:** one egg shell (a lathe/ellipsoid, cut/faced for the seat opening)
  replacing the `RoundedBoxGeometry` + torus lip (`:52-64`); add a horizontal
  shell seam, a rounded rear hatch panel, the low cyan strip as a strip rather
  than a full torus (`:95-99`), and small rear nozzles below the rear panel.
  Keep the pod's local height/footprint so `player.ts:12-16` framing and
  `focusAgent` (`:81`) stay valid, and keep `radius: 1.5` (`:323`).
- **Hair:** replace the ring cloud (`:242-284`) with clumped, overlapping curls —
  a few seeded clusters of 2–4 spheres plus a back mass, with deliberate
  silhouette. Delete the dead `back`/`void` math while rewriting (`:255-256`).
- **Face:** eye whites + iris so the eyes read through the lenses; thicken the
  frames slightly and keep them matte black (`:211-240`).
- **Body:** add a hood mass behind the neck, cuffs and hem; give the sneakers a
  toe cap, tongue and recessed laces instead of full-width bars (`:132-145`).
- **W-11 hooks:** name and export `leftHand`/`rightHand` (and keep `head`,
  `body`, `laptopScreen`) so the idle typing pass has something to drive.
- **Materials:** use the new `M` surfaces instead of the local `std()` library
  (`:20-35`), closing D7.
- **Contract:** keep `DeveloperAvatar` (`:37-45`) and extend additively.

### `src/entities/agent.ts`

- Move the bob from `m.root` (`:284`) onto a **body/suspension group inside the
  robot**, so the tracks stay planted and only the chassis breathes (S4, R10).
- Add the per-state hooks W-12 needs (boot lift, terrain tilt) without changing
  the `POSTURE` table's meaning; keep the ring/lens/posture channels intact
  (W-03).
- Attach the contact shadow to `this.root` and fade it by state.
- Coordinate: this file is shared with W-12; one owner must touch it.

### `src/core/engine.ts`

- Build a small PMREM environment once (`RoomEnvironment` from
  `three/examples/jsm/environments/RoomEnvironment.js`, already an available
  three module — no new dependency) and expose the texture.
- **Surgical choice:** assign it to the entity materials' `envMap`
  (`M.metal`/`M.steel`/`M.lensGlass`/chrome) rather than `scene.environment`, so
  the ship's look is guaranteed unchanged. Note `scene.environment` as a
  separate, optional future item if the developer wants the whole ship to gain
  IBL.
- Leave the shadow rig alone unless the contact shadow proves insufficient; a
  tight second shadow light is a real cost and W-18 already flags draw
  calls/lights.

### `docs/PLAN.md`

- Append a `Decision` note under the relevant items recording the A-over-B
  choice in the same style as the W-01 decision (`PLAN.md:52-62`), and reference
  this document. Add the entity art work as a new numbered item (e.g. W-25) if
  the developer wants it tracked in the backlog. **Only if the developer wants
  the backlog touched** — otherwise this document stands alone.

### `docs/reference/entities-reference.png`

- Unchanged. It is the acceptance target.

---

## 6. Ordered steps + acceptance criteria

Each step is independently reviewable. **Implement in order**; steps 4–5 depend
on 1, and step 6 depends on 2–3.

### Step 1 — Procedural surface library
- **Change:** new `src/core/surfaces.ts`; additive `M` entries in
  `palette.ts`.
- **Accept:** a cream plastic surface shows visible micro-grain and a panel-line
  highlight; maps are generated once (log the count — a second call for the same
  key must hit the cache); `npm run typecheck` passes; the ship's existing props
  render identically.
- **Deps:** none. Enables W-13 (shared surfaces).

### Step 2 — Robot base + hatch
- **Change:** `robot.ts` wheels/hubs, linked treads, recessed front hatch,
  `triangle` icon in `textures.ts`.
- **Accept:** side and 3/4 views show road wheels distinctly proud of a linked
  rubber belt; the front shows a recessed hatch with the `▷` icon; `RobotModel`
  is unchanged or extended additively; typecheck passes.
- **Deps:** none.

### Step 3 — Robot head + detailing + merge
- **Change:** `robot.ts` barrels/band/mount, panel lines, vents, rear seam;
  merge non-animated geometry per material to ≤ ~12 meshes/robot.
- **Accept:** the twin barrels dominate the head from front/top/back; the badge
  and the lens/ring state channels still animate; a mesh count is measured and
  recorded in this doc; visuals survive all four role variants.
- **Deps:** step 2.

### Step 4 — Developer pod
- **Change:** `developer.ts` egg shell + seam + rear hatch + nozzles + low cyan
  strip.
- **Accept:** front/side/back views read as one smooth egg with a seam and a low
  light strip; the pod's footprint/height and `radius` keep the follow camera
  and collision unchanged.
- **Deps:** step 1.

### Step 5 — Developer figure
- **Change:** `developer.ts` hair clumps, eyes/frames, hoodie/hem/cuffs, sneakers,
  laptop; named hands.
- **Accept:** the head reads as a friendly face with visible eyes behind round
  black frames and a thick clumped curly mass (compare to the head close-up); a
  10-second idle loop (W-11) reads as alive; `DeveloperAvatar` preserved or
  extended additively.
- **Deps:** step 4. Partly dependent on **W-11** for the idle itself — this step
  provides the rig, W-11 provides the motion.

### Step 6 — Suspension + contact shadows
- **Change:** `agent.ts` bob relocation + state fade; `surfaces.ts`
  `contactShadow`; attach in both entities.
- **Accept:** the tracks stay planted while the chassis bobs; each entity has a
  soft contact ellipse that follows it and fades with state; no z-fighting at
  any camera angle.
- **Deps:** steps 2–3. **W-12** owns the articulation behaviour this enables.

### Step 7 — Environment / lighting
- **Change:** `engine.ts` PMREM env assigned to entity materials.
- **Accept:** metal rings, lens glass and the chrome laptop show a soft studio
  highlight; the ship is visually unchanged (before/after screenshots of a room
  match); no measurable frame-time regression.
- **Deps:** step 1.

### Step 8 — Verification + record
- **Change:** `docs/PLAN.md` decision note (optional, see above).
- **Accept:** `npm run typecheck` and `npm run build` pass (run by the owner of
  `src` once the current concurrent edit is done — **not during this planning
  task**); a browser smoke test shows a clean console (no errors, no three.js
  deprecation warnings); a side-by-side of every sheet view is attached to the
  report.
- **Deps:** all.

**Ordering constraint:** this plan does not start until the worker currently
editing `src/` has finished, to avoid conflicts in `developer.ts`/`robot.ts`.

---

## 7. Consistency with existing plan items

- **W-11 (developer idle).** This plan deliberately *builds the rig*, not the
  motion: it names `head`, `leftHand`, `rightHand`, `laptopScreen` and keeps
  `body`. W-11 then adds typing/head-turn/screen-glow on those names. Do not add
  a walk variant here.
- **W-12 (robot articulation).** Step 6 supplies the missing body-over-tracks
  suspension group and the boot/tilt hooks; W-12 supplies the behaviour
  (spawn lift, terrain tilt, lens iris). The `POSTURE` table is the shared
  contract; do not change its fields.
- **W-13 (prop kit depth).** `core/surfaces.ts` is intentionally reusable by
  `world/props.ts`, so W-13's new props (`ServerRackDoor`, `CableTray`,
  `ToolCart`, …) inherit the same panel-line/plastic treatment and the entity
  visual language stays coherent with the ship.
- **W-03 (state readable without colour).** Surface detail must never be the
  state channel. Lens brightness, ring opacity and posture (`agent.ts:34-57`,
  `:286-305`) remain the only state signals; emissive stays limited to lens,
  ring, antenna tip and pod light, and the step-2/3 detail work must be
  non-emissive. W-24's reduced-colour goal therefore still holds.
- **W-18 (performance).** Step 3's per-material merge is a net draw-call win
  (≈80 → ≈12 meshes/robot) that helps W-18 rather than fighting it; step 7 adds
  one PMREM cubemap, not a light.

---

## 8. Performance budget

- Robot: 80 → ~12 meshes/robot; geometry built once and shared; only
  accent/lens/ring materials cloned per robot.
- Developer: ~116 → ~40 meshes by merging the static pod/body pieces per
  material and reducing hair balls to clumps.
- New maps: ≤ 6 procedural textures at 128–256 px, generated once, shared.
- One PMREM environment cubemap.
- No new runtime dependency; no asset bytes.
- Acceptance guard: measure draw calls and frame time before/after on the same
  mission, and record it in this doc.

---

## 9. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Another worker owns `src/`: merge conflicts in `developer.ts` / `robot.ts` / `agent.ts`. | Do not start until that worker is done; keep each step a single file where possible; `agent.ts` (step 6) is the only shared hotspot — give it one owner. |
| `aoMap` UV-channel behaviour changed across three releases and this repo is on r186. | Verify on a throwaway material first; if it needs a second UV set, bake the AO multiply into the albedo `map` and drop `aoMap`. |
| `MeshPhysicalMaterial` sheen/clearcoat cost and look. | Use it only on the hoodie and skin (two small surfaces); keep everything else Standard. Compare before/after. |
| PMREM can wash out the stylized look or raise GPU memory. | Assign `envMap` per entity material, not `scene.environment`; tune with `envMapIntensity`; ship it behind a visual before/after. |
| Character hair/face is the hardest target and A may not pass acceptance. | Explicit revisit trigger in §3 — escalate to the developer, do not silently start B. |
| Changing shared `M` materials would alter the whole batched ship (`batch.ts` keys by material identity). | Additive `M` entries only; never mutate existing `M` materials. |
| The ~0.42 floating offset (R10) may be intentional. | Verify visually with the status ring against the floor before moving it; if lowered, retune the ring's `polygonOffset`/`renderOrder` to avoid z-fighting. |
| Contact-shadow planes z-fight or sort wrongly with the floor. | `depthWrite: false`, tiny `polygonOffset`, explicit `renderOrder`, and a fade-out as the entity moves. |

---

## 10. Verification commands (definition of done)

```bash
cd src/world
npm run typecheck        # tsc --noEmit
npm run build            # tsc + vite build -> dist/
npm run dev              # http://localhost:5273
```

Manual pass for this work:

1. Inspect both entities from the five sheet angles + top/back; compare against
   the reference sheet view by view.
2. Confirm all four role variants and Team Mate keep their accent + icon + tip.
3. Fly the ship; check the pod and robots for z-fighting, shadow acne and
   contact-shadow popping.
4. Dispatch a mission at ×8 and confirm the lens/ring/posture state read still
   works with the HUD hidden (W-03).
5. Console clean: no errors, no three.js deprecation warnings.

---

## 11. Decisions left to the developer

1. Approve **A** (recommended) or ask for the B asset contract.
2. Say whether the entities should sit on the floor or hover (R10).
3. Say whether the backlog `docs/PLAN.md` should record this choice and add an
   entity-art item, or whether this document stands alone.

# Third-party notices

VeriFlow vendors adapted copies of free React Bits components (https://github.com/DavidHDev/react-bits).

Upstream license: **MIT + Commons Clause**. This is not MIT-only. Pro sources were not copied.

Upstream commit vendored from: `3a1c7f2f9f94ed833934ab5c2635760b9e644583` (tag/commit on 2026-09-11 clone).

| Component | Upstream | Local file | Page | Modified |
|---|---|---|---|---|
| DotGrid | `src/ts-default/Backgrounds/DotGrid` | `apps/web/components/reactbits/DotGrid.tsx` | Home | Replaced GSAP InertiaPlugin with rAF spring; token colors; pause when `document.hidden` |
| SpotlightCard | `src/ts-default/Components/SpotlightCard` | `apps/web/components/reactbits/SpotlightCard.tsx` | Home latest run | Token spotlight color |
| MagicBento | `src/ts-default/Components/MagicBento` | `apps/web/components/reactbits/MagicBento.tsx` | Home 6-cell workbench | GSAP → pointer CSS vars; teal tokens; optional `href` |
| AnimatedList | `src/ts-default/Components/AnimatedList` | `apps/web/components/reactbits/AnimatedList.tsx` | Verification activity | ReactNode items; `once` in-view |
| Stepper | `src/ts-default/Components/Stepper` | `apps/web/components/reactbits/Stepper.tsx` | Verification pipeline | Status playback + glow on RUNNING |
| CardSwap | `src/ts-default/Components/CardSwap` | `apps/web/components/reactbits/CardSwap.tsx` | Repair candidates | GSAP timeline → CSS 3D + interval |
| Threads | `src/ts-default/Backgrounds/Threads` | `apps/web/components/reactbits/Threads.tsx` | Architecture | ogl/WebGL → Canvas 2D (no new WebGL stack) |
| ElasticSlider | `src/ts-default/Components/ElasticSlider` | `apps/web/components/reactbits/ElasticSlider.tsx` | Settings code font | Dropped Chakra/react-icons; kept `motion`; added `onChange` |
| ChromaGrid | `src/ts-default/Components/ChromaGrid` | `apps/web/components/reactbits/ChromaGrid.tsx` | Algorithms | GSAP → rAF damping; keep overlay/mask spotlight; optional badge instead of avatars; token palette |
| LightRays | `src/ts-default/Backgrounds/LightRays` | `apps/web/components/reactbits/LightRays.tsx` | Login | Canvas 2D adaptation |
| FadeContent | React Bits FadeContent (adapted) | `apps/web/components/reactbits/FadeContent.tsx` | extra | IntersectionObserver fade |
| GridScan | VeriFlow original (not Pro) | `apps/web/components/reactbits/GridScan.tsx` | Verification new run only | Canvas scan; idle/history off |
| Scanner | VeriFlow original (not Pro) | `apps/web/components/reactbits/Scanner.tsx` | Stress request only | Idle off; response off; history never |
| Topography | VeriFlow original contour | `apps/web/components/reactbits/Topography.tsx` | Evidence | Low-opacity contour lines |

GridScan / Scanner / Topography are original files that implement the HARD P0 behaviors. They are not React Bits Pro copies.

Other runtime licenses: Python (PSF), FastAPI/Pydantic/Uvicorn (MIT), Next.js/React (MIT), Monaco (MIT), @xyflow/react (MIT), Docker (Apache-2.0), nginx (BSD), pytest (MIT), `motion` (MIT, ElasticSlider/AnimatedList/Stepper).

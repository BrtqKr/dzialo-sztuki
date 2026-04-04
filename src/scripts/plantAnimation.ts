import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { bloomOut } from "./flowerTransition";

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;
let tickerCb: ((time: number) => void) | null = null;
let revealTl: gsap.core.Timeline | null = null;
let revealProxy = { progress: 0 };
let maxRevealProgress = 0;
let skipRevealTween = false;

// ─── Helpers ────────────────────────────────────────────────────────────────

function lineLen(l: SVGLineElement): number {
  return Math.hypot(
    l.x2.baseVal.value - l.x1.baseVal.value,
    l.y2.baseVal.value - l.y1.baseVal.value,
  );
}

function hideStroke(el: SVGGeometryElement | SVGLineElement) {
  const len = el instanceof SVGLineElement ? lineLen(el) : el.getTotalLength();
  el.style.strokeDasharray = `${len}`;
  el.style.strokeDashoffset = `${len}`;
}

function svgCenter(el: SVGGraphicsElement): string {
  const b = el.getBBox();
  return `${b.x + b.width / 2} ${b.y + b.height / 2}`;
}

function byId(name: string) {
  return document.getElementById(name) as SVGGraphicsElement | null;
}

function sel<T extends Element>(s: string): T | null {
  return document.querySelector<T>(s);
}

// ── V-stem: both arms draw from top edges toward bottom vertex ────────────────
// The path runs: top-right → vertex(bottom) → top-left
// Trick: dasharray `right (L - right - left) left`
// right and left each grow from 0 → L/2, revealing from both tops toward center.
// Right arm has a slight head start to look natural (top elements appear first).
function addVStemTween(
  pathEl: SVGGeometryElement,
  tl: gsap.core.Timeline,
  position: number,
  duration: number,
) {
  const totalLen = pathEl.getTotalLength();
  const halfLen = totalLen / 2;
  const proxy = { right: 0, left: 0 };

  pathEl.style.strokeDasharray = `0 ${totalLen} 0`;
  pathEl.style.strokeDashoffset = "0";

  function updateDash() {
    const { right, left } = proxy;
    const gap = Math.max(0, totalLen - right - left);
    pathEl.style.strokeDasharray = `${right} ${gap} ${left}`;
  }

  // Right arm: starts immediately, faster acceleration (top appears first)
  tl.to(
    proxy,
    { right: halfLen, duration, ease: "power2.out", onUpdate: updateDash },
    position,
  );
  // Left arm: 1.5 unit delay, slightly longer (natural asymmetry)
  tl.to(
    proxy,
    { left: halfLen, duration: duration * 1.1, ease: "power2.out", onUpdate: updateDash },
    position + 1.5,
  );
}

// ── Root clip mask ────────────────────────────────────────────────────────────
// Reveal root paths by growing a clipPath rect downward — far cheaper than
// stroke-dashoffset on long complex curves.
interface RootClip {
  rect: SVGRectElement;
  totalHeight: number;
}

function createRootClip(
  groupEl: SVGGElement,
  pathEl: SVGGeometryElement,
  svgEl: SVGSVGElement,
): RootClip | null {
  const bbox = pathEl.getBBox();
  if (!bbox || bbox.height < 1) return null;

  const defs = svgEl.querySelector("defs");
  if (!defs) return null;

  const clipId = `rc-${Math.random().toString(36).slice(2, 8)}`;
  const clipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
  clipPath.setAttribute("id", clipId);

  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  const pad = 30;
  rect.setAttribute("x", String(bbox.x - pad));
  rect.setAttribute("y", String(bbox.y - 5));
  rect.setAttribute("width", String(bbox.width + pad * 2));
  rect.setAttribute("height", "0");

  clipPath.appendChild(rect);
  defs.appendChild(clipPath);
  groupEl.setAttribute("clip-path", `url(#${clipId})`);

  return { rect, totalHeight: bbox.height + 10 };
}

// ─── Cleanup / Teardown ─────────────────────────────────────────────────────

export function teardown() {
  cleanup();
  window.scrollTo(0, 0);
}

function cleanup() {
  ScrollTrigger.getAll().forEach((t) => t.kill());
  gsap.killTweensOf("*");
  if (tickerCb) {
    gsap.ticker.remove(tickerCb);
    tickerCb = null;
  }
  if (lenis) {
    lenis.destroy();
    lenis = null;
  }
  revealTl = null;
  revealProxy = { progress: 0 };
  maxRevealProgress = 0;
  skipRevealTween = false;
}

// ─── Scroll restore ──────────────────────────────────────────────────────────

export function restoreScroll(y: number) {
  // Skip the smooth 0.8s tween; set reveal state instantly
  skipRevealTween = true;
  // window.scrollTo is synchronous — ScrollTrigger.update reads it immediately
  window.scrollTo(0, y);
  if (lenis) lenis.scrollTo(y, { immediate: true });
  requestAnimationFrame(() => {
    ScrollTrigger.update();
    requestAnimationFrame(() => { skipRevealTween = false; });
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function initPlantAnimation() {
  const sticky = document.getElementById("plant-sticky");
  const svg = sticky?.querySelector<SVGSVGElement>("svg");
  if (!sticky || !svg) return;

  cleanup();

  const skipAnimation = !!sessionStorage.getItem("plantAnimationPlayed");

  // ── Lenis ──────────────────────────────────────────────────────────────────
  lenis = new Lenis({
    autoRaf: false,
    duration: 1.4,
    smoothWheel: true,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  });
  tickerCb = (time: number) => lenis!.raf(time * 1000);
  gsap.ticker.add(tickerCb);
  gsap.ticker.lagSmoothing(0);
  lenis.on("scroll", ScrollTrigger.update);

  // ── Pan range ──────────────────────────────────────────────────────────────
  const containerH = sticky.clientHeight;
  const svgH = svg.getBoundingClientRect().height;
  const panRange = Math.max(0, svgH - containerH);

  // ── Collect elements ───────────────────────────────────────────────────────

  const w1 = byId("Warstwa_1");
  const bgLines: (SVGLineElement | SVGGeometryElement)[] = [];
  const vertLines: (SVGLineElement | SVGGeometryElement)[] = [];

  if (w1) {
    w1.querySelectorAll<SVGElement>(":scope > line, :scope > path").forEach((el) => {
      const cls = el.getAttribute("class") || "";
      if (cls.includes("cls-6") || cls.includes("cls-7")) bgLines.push(el as any);
      else if (cls.includes("cls-8") || cls.includes("cls-9")) vertLines.push(el as any);
    });
  }

  const accentStems = [
    sel<SVGGeometryElement>("#Warstwa_3_kopia path"),
    sel<SVGGeometryElement>("#Warstwa_3 path"),
  ].filter(Boolean) as SVGGeometryElement[];

  const vStems = [
    sel<SVGGeometryElement>("#Warstwa_21 path"),
    sel<SVGGeometryElement>("#Warstwa_2_kopia path"),
  ].filter(Boolean) as SVGGeometryElement[];

  const topFlowers = [
    byId("Warstwa_7_kopia_2"),
    byId("Warstwa_7"),
    byId("Warstwa_7_kopia"),
  ].filter(Boolean) as SVGGraphicsElement[];

  const sideFlowers = [
    byId("Warstwa_5_kopia_2"),
    byId("Warstwa_5"),
    byId("Warstwa_5_kopia"),
  ].filter(Boolean) as SVGGraphicsElement[];

  const groundBands = [byId("Warstwa_8"), byId("Warstwa_9")].filter(
    Boolean,
  ) as SVGGraphicsElement[];

  const rootStars = [byId("Warstwa_14_kopia"), byId("Warstwa_14")].filter(
    Boolean,
  ) as SVGGraphicsElement[];

  const rootGroupIds = [
    "Warstwa_23", "Warstwa_24", "Warstwa_25", "Warstwa_26",
    "Warstwa_27", "Warstwa_28", "Warstwa_29", "Warstwa_30",
  ];
  const rootGroups = rootGroupIds
    .map((n) => document.getElementById(n) as SVGGElement | null)
    .filter(Boolean) as SVGGElement[];

  // ── GPU hints for pattern/complex fill elements ────────────────────────────
  // Promote to compositor layers to avoid repaint on transform changes
  svg.querySelectorAll<SVGElement>(".cls-15, .cls-5, .cls-10, .cls-13").forEach((el) => {
    el.style.willChange = "transform";
    el.style.transform = "translateZ(0)";
  });

  // ── Shape-rendering hints ──────────────────────────────────────────────────
  // Straight lines don't need AA; reduces sub-pixel sampling cost
  bgLines.forEach((el) => (el as SVGElement).setAttribute("shape-rendering", "crispEdges"));
  vertLines.forEach((el) => (el as SVGElement).setAttribute("shape-rendering", "crispEdges"));
  // Root paths: trade quality for speed (they're in a dark background)
  rootGroups.forEach((g) =>
    g.querySelectorAll("path").forEach((p) =>
      p.setAttribute("shape-rendering", "optimizeSpeed"),
    ),
  );

  // ── Measure centers BEFORE hiding ──────────────────────────────────────────
  const topOrigins = topFlowers.map(svgCenter);
  const sideOrigins = sideFlowers.map(svgCenter);
  const starOrigins = rootStars.map(svgCenter);

  // ── Root clip masks (measure getBBox before hiding anything) ───────────────
  const rootClips = rootGroups
    .map((g) => {
      const path = g.querySelector("path");
      if (!path) return null;
      return createRootClip(g, path as SVGGeometryElement, svg);
    })
    .filter(Boolean) as RootClip[];

  // ── Initial states ─────────────────────────────────────────────────────────

  [...bgLines, ...vertLines].forEach((el) => hideStroke(el as any));
  accentStems.forEach(hideStroke);
  // vStems: handled by addVStemTween
  // rootPaths: handled by clipPath (no strokeDashoffset)

  topFlowers.forEach((el, i) => gsap.set(el, { scale: 0, svgOrigin: topOrigins[i] }));
  sideFlowers.forEach((el, i) => gsap.set(el, { scale: 0, svgOrigin: sideOrigins[i] }));

  rootStars.forEach((el, i) => gsap.set(el, { scale: 0, opacity: 0, svgOrigin: starOrigins[i] }));

  // Hide root groups entirely — browser won't rasterize pattern fills until needed
  rootGroups.forEach((g) => { g.style.visibility = "hidden"; });

  // ── Pan timeline (bidirectional scrub — SVG always follows scroll) ──────────
  const panTl = gsap.timeline();
  panTl.to(svg, { y: -panRange, ease: "none", duration: 100, force3D: true });

  ScrollTrigger.create({
    trigger: "#plant-scroll",
    start: "top top",
    end: "bottom bottom",
    scrub: 1.2,
    animation: panTl,
  });

  // ── Reveal timeline (forward-only — elements stay revealed on scroll back) ──
  revealTl = gsap.timeline({ paused: true });

  // 0–12: Top flowers scale in + background lines in parallel
  topFlowers.forEach((el, i) => {
    revealTl.to(
      el,
      { scale: 1, duration: 10, ease: "power2.out", svgOrigin: topOrigins[i] },
      i * 1.5,
    );
  });
  if (bgLines.length) {
    revealTl.to(
      bgLines,
      { strokeDashoffset: 0, stagger: 0.8, duration: 10, ease: "power1.inOut" },
      0,
    );
  }

  // 3–18: Vertical thin lines
  if (vertLines.length) {
    revealTl.to(
      vertLines,
      { strokeDashoffset: 0, stagger: 0.6, duration: 12, ease: "power1.inOut" },
      3,
    );
  }

  // 10–22: Side flowers
  sideFlowers.forEach((el, i) => {
    revealTl.to(
      el,
      { scale: 1, duration: 10, ease: "power2.out", svgOrigin: sideOrigins[i] },
      10 + i * 1.5,
    );
  });

  // 12–28: Accent stems
  if (accentStems.length) {
    revealTl.to(
      accentStems,
      { strokeDashoffset: 0, stagger: 3, duration: 14, ease: "power2.inOut" },
      12,
    );
  }

  // 20–46: V-stems, both arms from top toward vertex
  vStems.forEach((path, i) => {
    addVStemTween(path, revealTl, 20 + i * 3, 22);
  });

  // 50–62: Root junction stars
  rootStars.forEach((el, i) => {
    revealTl.to(
      el,
      { scale: 1, opacity: 1, duration: 8, ease: "power2.out", svgOrigin: starOrigins[i] },
      50 + i * 2,
    );
  });

  // 60: Unhide root groups right before their animation
  revealTl.set(rootGroups, { visibility: "visible" }, 60);

  // 61–92: Root clips — sequential stagger to prevent paint storm
  // Each root: 6 units duration, 4 unit stagger → adjacent overlap = 2 units max
  rootClips.forEach(({ rect, totalHeight }, i) => {
    revealTl.to(
      rect,
      { attr: { height: totalHeight }, duration: 6, ease: "power1.inOut" },
      61 + i * 4,
    );
  });

  // ── Forward-only scroll driver / instant reveal ───────────────────────────
  if (skipAnimation) {
    // Already seen this visit — show everything instantly, no reveal scroll driver needed
    revealProxy.progress = 1;
    maxRevealProgress = 1;
    revealTl!.progress(1, false);
  } else {
    // First visit — mark as played, then drive revealTl forward-only via scroll
    sessionStorage.setItem("plantAnimationPlayed", "1");
    ScrollTrigger.create({
      trigger: "#plant-scroll",
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        if (self.progress > maxRevealProgress) {
          maxRevealProgress = self.progress;
          if (skipRevealTween) {
            // Instant — used when restoring scroll after back-navigation
            revealProxy.progress = maxRevealProgress;
            revealTl!.progress(maxRevealProgress, false);
          } else {
            // Smooth catch-up tween for normal scrolling
            gsap.to(revealProxy, {
              progress: maxRevealProgress,
              duration: 0.8,
              ease: "power1.out",
              overwrite: true,
              onUpdate() {
                revealTl!.progress(revealProxy.progress, false);
              },
            });
          }
        }
      },
    });
  }

  // ── Click handlers ─────────────────────────────────────────────────────────
  topFlowers.forEach((el) => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => bloomOut(el, "#f7adc5", "/actions/flower-1"));
  });
  sideFlowers.forEach((el) => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => bloomOut(el, "#f7cb1b", "/actions/flower-2"));
  });
}

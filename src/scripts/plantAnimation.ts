import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { bloomOut } from "./flowerTransition";

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;
let tickerCb: ((time: number) => void) | null = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

function lineLen(l: SVGLineElement): number {
  return Math.hypot(
    l.x2.baseVal.value - l.x1.baseVal.value,
    l.y2.baseVal.value - l.y1.baseVal.value,
  );
}

function hideStroke(el: SVGGeometryElement | SVGLineElement) {
  const len =
    el instanceof SVGLineElement ? lineLen(el) : el.getTotalLength();
  el.style.strokeDasharray = `${len}`;
  el.style.strokeDashoffset = `${len}`;
}

function svgCenter(el: SVGGraphicsElement): string {
  const b = el.getBBox();
  return `${b.x + b.width / 2} ${b.y + b.height / 2}`;
}

function sel<T extends Element>(s: string): T | null {
  return document.querySelector<T>(s);
}

function byId(name: string) {
  return document.getElementById(name) as SVGGraphicsElement | null;
}

/**
 * Animate a V-shaped path from both ends toward the center.
 * Uses dasharray trick: `x (L-2x) x` where x goes from 0 → L/2.
 */
function addVStemTween(
  pathEl: SVGGeometryElement,
  tl: gsap.core.Timeline,
  position: number,
  duration: number,
) {
  const totalLen = pathEl.getTotalLength();
  const halfLen = totalLen / 2;
  const proxy = { x: 0 };

  // Initial: invisible
  pathEl.style.strokeDasharray = `0 ${totalLen} 0`;
  pathEl.style.strokeDashoffset = "0";

  tl.to(
    proxy,
    {
      x: halfLen,
      duration,
      ease: "power2.inOut",
      onUpdate() {
        const x = proxy.x;
        pathEl.style.strokeDasharray = `${x} ${totalLen - 2 * x} ${x}`;
      },
    },
    position,
  );
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

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
}

// ─── Scroll restore ─────────────────────────────────────────────────────────

export function restoreScroll(y: number) {
  if (lenis) {
    lenis.scrollTo(y, { immediate: true });
  } else {
    window.scrollTo(0, y);
  }
  // Give GSAP a tick to catch up
  requestAnimationFrame(() => ScrollTrigger.refresh());
}

// ─── Main ───────────────────────────────────────────────────────────────────

export function initPlantAnimation() {
  const sticky = document.getElementById("plant-sticky");
  const svg = sticky?.querySelector<SVGSVGElement>("svg");
  if (!sticky || !svg) return;

  cleanup();

  // ── Lenis ──────────────────────────────────────────────────────────────────
  lenis = new Lenis({
    autoRaf: false,
    duration: 1.2,
    smoothWheel: true,
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
    w1.querySelectorAll<SVGElement>(":scope > line, :scope > path").forEach(
      (el) => {
        const cls = el.getAttribute("class") || "";
        if (cls.includes("cls-6") || cls.includes("cls-7")) {
          bgLines.push(el as any);
        } else if (cls.includes("cls-8") || cls.includes("cls-9")) {
          vertLines.push(el as any);
        }
      },
    );
  }

  const accentStems = [
    sel<SVGGeometryElement>("#Warstwa_3_kopia path"),
    sel<SVGGeometryElement>("#Warstwa_3 path"),
  ].filter(Boolean) as SVGGeometryElement[];

  // V-shaped main stems (animated from both edges to bottom)
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

  const rootPaths = [
    "Warstwa_23", "Warstwa_24", "Warstwa_25", "Warstwa_26",
    "Warstwa_27", "Warstwa_28", "Warstwa_29", "Warstwa_30",
  ]
    .map((n) => sel<SVGGeometryElement>(`#${n} path`))
    .filter(Boolean) as SVGGeometryElement[];

  // ── Measure centers BEFORE hiding ──────────────────────────────────────────
  const topOrigins = topFlowers.map(svgCenter);
  const sideOrigins = sideFlowers.map(svgCenter);
  const starOrigins = rootStars.map(svgCenter);

  // ── Initial states ─────────────────────────────────────────────────────────

  [...bgLines, ...vertLines].forEach((el) => hideStroke(el as any));
  accentStems.forEach(hideStroke);
  rootPaths.forEach(hideStroke);
  // vStems are handled by addVStemTween (sets dasharray directly)

  topFlowers.forEach((el, i) =>
    gsap.set(el, { scale: 0, svgOrigin: topOrigins[i] }),
  );
  sideFlowers.forEach((el, i) =>
    gsap.set(el, { scale: 0, svgOrigin: sideOrigins[i] }),
  );

  gsap.set(groundBands, { opacity: 0 });
  rootStars.forEach((el, i) =>
    gsap.set(el, { scale: 0, opacity: 0, svgOrigin: starOrigins[i] }),
  );

  // ── Master timeline ────────────────────────────────────────────────────────

  const tl = gsap.timeline({ defaults: { ease: "none" } });

  // Pan: smoothly scroll through the SVG from top to bottom
  tl.to(svg, { y: -panRange, ease: "none", duration: 100, force3D: true }, 0);

  // 0–18: Top flower cluster scales in from nothing
  topFlowers.forEach((el, i) => {
    tl.to(
      el,
      { scale: 1, duration: 16, ease: "power2.out", svgOrigin: topOrigins[i] },
      1 + i * 2,
    );
  });

  // 0–16: Background decorative lines draw (in parallel with flowers)
  if (bgLines.length) {
    tl.to(
      bgLines,
      { strokeDashoffset: 0, stagger: 1, duration: 14, ease: "power1.inOut" },
      0,
    );
  }

  // 5–22: Vertical thin lines draw
  if (vertLines.length) {
    tl.to(
      vertLines,
      { strokeDashoffset: 0, stagger: 1, duration: 16, ease: "power1.inOut" },
      5,
    );
  }

  // 15–33: Side flower cluster scales in
  sideFlowers.forEach((el, i) => {
    tl.to(
      el,
      { scale: 1, duration: 16, ease: "power2.out", svgOrigin: sideOrigins[i] },
      15 + i * 2,
    );
  });

  // 18–42: Accent stems draw (single direction)
  if (accentStems.length) {
    tl.to(
      accentStems,
      { strokeDashoffset: 0, stagger: 4, duration: 20, ease: "power2.inOut" },
      18,
    );
  }

  // 28–58: V-shaped main stems (from both edges to bottom center)
  vStems.forEach((path, i) => {
    addVStemTween(path, tl, 28 + i * 4, 26);
  });

  // 55–68: Ground bands fade in
  tl.to(
    groundBands,
    { opacity: 1, stagger: 2, duration: 10, ease: "power1.inOut" },
    55,
  );

  // 60–73: Root junction stars scale in
  rootStars.forEach((el, i) => {
    tl.to(
      el,
      { scale: 1, opacity: 1, duration: 10, ease: "power2.out", svgOrigin: starOrigins[i] },
      60 + i * 2,
    );
  });

  // 70–95: Root branches draw, staggered
  if (rootPaths.length) {
    tl.to(
      rootPaths,
      { strokeDashoffset: 0, stagger: 1.5, duration: 18, ease: "power1.inOut" },
      70,
    );
  }

  // ── ScrollTrigger ──────────────────────────────────────────────────────────
  ScrollTrigger.create({
    trigger: "#plant-scroll",
    start: "top top",
    end: "bottom bottom",
    scrub: 1.5,
    animation: tl,
  });

  // ── Flower click handlers ──────────────────────────────────────────────────
  topFlowers.forEach((el) => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () =>
      bloomOut(el, "#f7adc5", "/actions/flower-1"),
    );
  });
  sideFlowers.forEach((el) => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () =>
      bloomOut(el, "#f7cb1b", "/actions/flower-2"),
    );
  });
}

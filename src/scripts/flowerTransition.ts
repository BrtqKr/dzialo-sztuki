import gsap from "gsap";

/**
 * Called on every page load. If a bloom transition was in progress
 * (saved in sessionStorage), recreate the full-screen overlay and
 * collapse it, giving a seamless arrival animation.
 */
export function initBloomTransition() {
  const overlay = document.getElementById("bloom-overlay");
  if (!overlay) return;

  const data = sessionStorage.getItem("bloomTransition");
  if (data) {
    sessionStorage.removeItem("bloomTransition");

    // Overlay starts at full screen white, then collapses
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 9999;
      background: #f5f5f5;
      clip-path: circle(150% at 50% 50%);
      pointer-events: none;
      display: block;
    `;

    gsap.to(overlay, {
      clipPath: "circle(0% at 50% 50%)",
      duration: 0.6,
      ease: "power2.inOut",
      onComplete: () => {
        overlay.style.display = "none";
      },
    });
  } else {
    overlay.style.display = "none";
  }
}

/**
 * Expand a bloom overlay from the flower, transition color to white,
 * save state to sessionStorage, then navigate.
 */
export function bloomOut(
  flowerEl: Element,
  color: string,
  targetUrl: string,
) {
  const overlay = document.getElementById("bloom-overlay");
  if (!overlay) return;

  const rect = flowerEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  // Persist for the destination page's collapse animation
  sessionStorage.setItem("bloomTransition", "1");
  sessionStorage.setItem("plantScrollY", String(window.scrollY));

  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: ${color};
    clip-path: circle(0% at ${cx}px ${cy}px);
    pointer-events: none;
    display: block;
  `;

  gsap.to(overlay, {
    clipPath: `circle(150% at ${cx}px ${cy}px)`,
    backgroundColor: "#f5f5f5",
    duration: 0.7,
    ease: "power2.inOut",
    onComplete: () => {
      // Use anchor click so Astro's ClientRouter handles the navigation
      const a = document.createElement("a");
      a.href = targetUrl;
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
  });
}

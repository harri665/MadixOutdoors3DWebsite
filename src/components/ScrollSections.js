import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { useAnimationAPI } from "../hooks/useAnimationAPI";

/** ===== Distance-aware, de-jittered camera dispatcher ===== */
const CAM_EPS = 0.005;           // minimum change before we send a new pose
const CAM_MIN_DUR = 0.6;         // seconds
const CAM_MAX_DUR = 4.0;         // seconds
const CAM_DIST_TO_DUR = 1.2;     // scale distance to duration

function vec3From(v) {
  return v instanceof THREE.Vector3 ? v.clone() : new THREE.Vector3().fromArray(v);
}
function poseDistance(a, b) {
  if (!a || !b) return Infinity;
  const ap = vec3From(a.position), at = vec3From(a.target);
  const bp = vec3From(b.position), bt = vec3From(b.target);
  return ap.distanceTo(bp) + at.distanceTo(bt);
}

function createCameraQueue() {
  const state = {
    lastSent: null,
    pending: null,
    raf: 0,
  };

  const dispatch = ({ position, target, duration, immediate }) => {
    const pos = position instanceof THREE.Vector3 ? position.toArray() : position;
    const tar = target instanceof THREE.Vector3 ? target.toArray() : target;
    window.dispatchEvent(
      new CustomEvent("setCameraPose", {
        detail: { position: pos, target: tar, duration, immediate },
      })
    );
  };

  const flush = () => {
    state.raf = 0;
    if (!state.pending) return;

    const { pose, baseDuration, immediate } = state.pending;
    const delta = poseDistance(state.lastSent, pose);

    // Dedup small movements to avoid spam / micro-jitters
    if (!state.lastSent || delta > CAM_EPS) {
      const durFromDelta = THREE.MathUtils.clamp(delta * CAM_DIST_TO_DUR, CAM_MIN_DUR, CAM_MAX_DUR);
      const finalDuration = Math.max(baseDuration ?? 0, durFromDelta); // respect a larger provided duration
      dispatch({ ...pose, duration: immediate ? 0 : finalDuration, immediate });
      state.lastSent = { position: vec3From(pose.position), target: vec3From(pose.target), duration: finalDuration };
    }

    state.pending = null;
  };

  return {
    queue(pose, { baseDuration = 2.0, immediate = false } = {}) {
      state.pending = { pose, baseDuration, immediate };
      if (!state.raf) state.raf = requestAnimationFrame(flush);
    },
    reset() {
      if (state.raf) cancelAnimationFrame(state.raf);
      state.raf = 0;
      state.pending = null;
      state.lastSent = null;
    },
    get last() {
      return state.lastSent;
    }
  };
}

/** ===== Predefined camera paths ===== */
const FLY_POSES = [
  { position: new THREE.Vector3(0, 0.8, -7), target: new THREE.Vector3(0, 0.5, 0), duration: 2.0 },
  { position: new THREE.Vector3(0, 0.8, -1), target: new THREE.Vector3(0, 0.8, 0), duration: 2.5 },
];

/** ===== Scroll Sections (DOM) → drive scrubbing + camera poses via events ===== */
export function ScrollSections() {
  const api = useAnimationAPI();
  const sect1Ref = useRef(null);
  const sect2Ref = useRef(null);
  const sect3Ref = useRef(null);
  const sect4Ref = useRef(null);
  const sect5Ref = useRef(null);
  const sect6Ref = useRef(null);

  const doorNameRef = useRef(null);
  const appliedGeo1Ref = useRef(false);
  const tentCloseAnimRef = useRef({ started: false, completed: false, startTime: 0 });

  // Camera queue for smooth, de-jittered transitions
  const camQRef = useRef(null);
  if (!camQRef.current) camQRef.current = createCameraQueue();

  // Pick a door clip once we know the names
  useEffect(() => {
    if (!api.clipNames || api.clipNames.length === 0) return;
    const door = api.clipNames.find((n) => n.toLowerCase().includes("door"));
    doorNameRef.current = door || null;
  }, [api.clipNames]);

  const applyGeo1Style = () => {
    if (!api.group || !api.group.current) return;
    if (appliedGeo1Ref.current) return;
    api.group.current.traverse((child) => {
      if (child.name === "geo1" && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            mat.transparent = true;
            mat.opacity = 0.5;
            mat.color.setHex(0xc39718);
            mat.needsUpdate = true;
          });
        } else {
          child.material.transparent = true;
          child.material.opacity = 0.5;
          child.material.color.setHex(0xc39718);
          child.material.needsUpdate = true;
        }
      }
    });
    appliedGeo1Ref.current = true;
  };

  const resetGeo1Style = () => {
    if (!api.group || !api.group.current) return;
    api.group.current.traverse((child) => {
      if (child.name === "geo1" && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            mat.transparent = false;
            mat.opacity = 1.0;
            mat.color.setHex(0xffffff);
            mat.needsUpdate = true;
          });
        } else {
          child.material.transparent = false;
          child.material.opacity = 1.0;
          child.material.color.setHex(0xffffff);
          child.material.needsUpdate = true;
        }
      }
    });
    appliedGeo1Ref.current = false;
  };

  const show3inObject = () => {
    if (!api.group || !api.group.current) return;
    api.group.current.traverse((child) => {
      if (child.name === "3in") {
        child.visible = true;
      }
    });
  };

  const hide3inObject = () => {
    if (!api.group || !api.group.current) return;
    api.group.current.traverse((child) => {
      if (child.name === "3in") {
        child.visible = false;
      }
    });
  };

  useEffect(() => {
    let lastScrollTime = 0;
    let lastS1 = 0, lastS2 = 0, lastS3 = 0, lastS4 = 0, lastS5 = 0, lastS6 = 0;
    let lastSection = -1;
    let lastActiveCamera = null;
    let tentHasBeenClosed = false;

    // Ensure tent starts fully open on initial load - animation0 must be complete
    const ensureInitialOpenState = () => {
      if (api.clipNames.length > 0) {
        const openEntries = [];
        if (api.clipNames.includes("animation0")) {
          openEntries.push({ name: "animation0", t: 1 });
        }
        if (api.clipNames.includes("TentOPENCLOSE")) {
          openEntries.push({ name: "TentOPENCLOSE", t: 1 });
        }
        if (openEntries.length > 0) api.scrub(openEntries, true);
      }
      // Hide 3in object initially
      hide3inObject();
    };

    const queueCam = (pose, { baseDuration = 2.0, immediate = false } = {}) => {
      camQRef.current.queue(pose, { baseDuration, immediate });
    };

    const onScroll = () => {
      const now = performance.now();
      const s1 = progressFor(sect1Ref.current);
      const s2 = progressFor(sect2Ref.current);
      const s3 = progressFor(sect3Ref.current);
      const s4 = progressFor(sect4Ref.current);
      const s5 = progressFor(sect5Ref.current);
      const s6 = progressFor(sect6Ref.current);

      const deltaTime = now - lastScrollTime;
      const maxDelta = Math.max(
        Math.abs(s1 - lastS1),
        Math.abs(s2 - lastS2),
        Math.abs(s3 - lastS3),
        Math.abs(s4 - lastS4),
        Math.abs(s5 - lastS5),
        Math.abs(s6 - lastS6)
      );
      const isFastScroll = deltaTime > 0 && maxDelta / deltaTime > 0.001;

      const entries = [];

      // Section change detection
      let currentSection = -1;
      if (s1 > 0 && s1 <= 1) currentSection = 1;
      else if (s2 > 0 && s2 <= 1) currentSection = 2;
      else if (s3 > 0 && s3 <= 1) currentSection = 3;
      else if (s4 > 0 && s4 <= 1) currentSection = 4;
      else if (s5 > 0 && s5 <= 1) currentSection = 5;
      else if (s6 > 0 && s6 <= 1) currentSection = 6;

      const isInTransition =
        currentSection === -1 && (s1 > 0 || s2 > 0 || s3 > 0 || s4 > 0 || s5 > 0 || s6 > 0);

      if (currentSection !== lastSection) {
        window.dispatchEvent(new CustomEvent("sectionChange", { detail: { section: currentSection } }));
        lastSection = currentSection;
      }

      // === Section 1: Open/Setup Tent (reversed)
      if (s1 > 0 && s1 <= 1) {
        const tRev = 1 - s1;
        resetGeo1Style();
        hide3inObject(); // Hide 3in object in section 1
        if (api.clipNames.includes("animation0")) entries.push({ name: "animation0", t: Math.max(0, tRev) });
        if (api.clipNames.includes("TentOPENCLOSE")) entries.push({ name: "TentOPENCLOSE", t: Math.max(0, tRev) });
        if (s1 >= 0.98) {
          if (api.clipNames.includes("animation0")) entries.push({ name: "animation0", t: 0 });
          if (api.clipNames.includes("TentOPENCLOSE")) entries.push({ name: "TentOPENCLOSE", t: 0 });
        }
        const pose = { position: new THREE.Vector3(3.2, 1.7, -3.6), target: new THREE.Vector3(0, 0.5, 0) };
        queueCam(pose, { baseDuration: isFastScroll ? 1.2 : 3.5 }); // never immediate on scroll
        lastActiveCamera = pose;
      }

      // === Section 2: Door + BackWindow
      const door = doorNameRef.current;
      if (s2 > 0 && s2 <= 1) {
        applyGeo1Style();
        hide3inObject(); // Hide 3in object in section 2
        if (door) entries.push({ name: door, t: s2 });

        const backWindowAnim = api.clipNames.find((name) => {
          const lowerName = name.toLowerCase();
          return (
            lowerName.includes("backwindow") ||
            lowerName.includes("back_window") ||
            lowerName.includes("back-window") ||
            lowerName === "backwindow" ||
            lowerName.includes("window")
          );
        });
        if (backWindowAnim) {
          entries.push({ name: backWindowAnim, t: s2 });
        } else {
          const possibleWindowAnim = api.clipNames.find((name) =>
            name.toLowerCase().includes("window") || name.toLowerCase().includes("back")
          );
          if (possibleWindowAnim) entries.push({ name: possibleWindowAnim, t: s2 });
        }

        const pose = { position: new THREE.Vector3(1.7, 1.15, -1.05), target: new THREE.Vector3(-0.7, 0.9, 0) };
        queueCam(pose, { baseDuration: isFastScroll ? 1.0 : 3.0 });
        lastActiveCamera = pose;
      }

      // === Section 3: Mattress (same camera as section 2)
      if (s3 > 0 && s3 <= 1) {
        applyGeo1Style();
        show3inObject(); // Show 3in object ONLY in section 3 (mattress animation)
        const pose = { position: new THREE.Vector3(1.7, 1.15, -1.05), target: new THREE.Vector3(-0.7, 0.9, 0) };
        queueCam(pose, { baseDuration: isFastScroll ? 1.0 : 3.0 });
        lastActiveCamera = pose;
      }

      // === Section 4: Side Animation
      if (s4 > 0 && s4 <= 1) {
        hide3inObject(); // Hide 3in object in section 4
        if (api.clipNames.includes("Side")) entries.push({ name: "Side", t: s4 });
        const pose = { position: new THREE.Vector3(0, 1.5, -5), target: new THREE.Vector3(0, 0, 0) };
        queueCam(pose, { baseDuration: isFastScroll ? 1.2 : 3.5 });
        lastActiveCamera = pose;
      }

      // === Section 5: Flythrough
      if (s5 > 0 && s5 <= 1) {
        hide3inObject(); // Hide 3in object in section 5
        const pose = interpolatePose(FLY_POSES, s5);
        if (pose) {
          queueCam(pose, { baseDuration: isFastScroll ? 0.9 : 2.2 });
          lastActiveCamera = pose;
        }
      }

      // === Section 6: Return to Starting Position (Full Circle)
      if (s6 > 0 && s6 <= 1) {
        hide3inObject(); // Hide 3in object in section 6
        resetGeo1Style(); // Reset geo1 material to original state
        
        // Reset all animations to their initial state (tent fully closed at end)
        const resetEntries = [];
        if (api.clipNames.includes("animation0")) {
          resetEntries.push({ name: "animation0", t: 0 }); // animation0 at 0 (tent closed)
        }
        if (api.clipNames.includes("TentOPENCLOSE")) {
          resetEntries.push({ name: "TentOPENCLOSE", t: 0 }); // Fully closed
        }
        // Reset any door animations
        const door = doorNameRef.current;
        if (door) {
          resetEntries.push({ name: door, t: 0 }); // Door closed/reset
        }
        // Reset window animations
        const backWindowAnim = api.clipNames.find((name) => {
          const lowerName = name.toLowerCase();
          return (
            lowerName.includes("backwindow") ||
            lowerName.includes("back_window") ||
            lowerName.includes("back-window") ||
            lowerName === "backwindow" ||
            lowerName.includes("window")
          );
        });
        if (backWindowAnim) {
          resetEntries.push({ name: backWindowAnim, t: 0 }); // Window closed/reset
        }
        // Reset side animation
        if (api.clipNames.includes("Side")) {
          resetEntries.push({ name: "Side", t: 0 }); // Side animation reset
        }
        
        entries.push(...resetEntries);
        
        // Return to the same position as the starting/idle position for a full circle
        const pose = { position: new THREE.Vector3(3, 1.6, 3.4), target: new THREE.Vector3(0, 0.5, 0) };
        queueCam(pose, { baseDuration: isFastScroll ? 1.5 : 4.0 });
        lastActiveCamera = pose;
      }

      if (entries.length > 0) {
        api.scrub(entries, true);
      } else {
        // manage tent state based on current section
        if (tentHasBeenClosed && s2 === 0 && s3 === 0 && s4 === 0 && s5 === 0 && s6 === 0) {
          const closeEntries = [];
          if (api.clipNames.includes("animation0")) closeEntries.push({ name: "animation0", t: 0 });
          if (api.clipNames.includes("TentOPENCLOSE")) closeEntries.push({ name: "TentOPENCLOSE", t: 0 });
          if (closeEntries.length > 0) api.scrub(closeEntries, true);
          else window.dispatchEvent(new Event("clearScrub"));
        } else {
          window.dispatchEvent(new Event("clearScrub"));
        }

        // Idle camera only when fully outside all sections (avoid mid-transition snaps)
        const allSectionsInactive = s1 === 0 && s2 === 0 && s3 === 0 && s4 === 0 && s5 === 0 && s6 === 0;
        if (allSectionsInactive && !isInTransition) {
          hide3inObject(); // Hide 3in object when idle
          const pose = { position: new THREE.Vector3(3, 1.6, 3.4), target: new THREE.Vector3(0, 0.5, 0) };
          queueCam(pose, { baseDuration: 4.0 });
          lastActiveCamera = pose;
        } else if (isInTransition && lastActiveCamera) {
          // keep last active pose during transitions; smoothing handles micro-movements
        }

        if (s2 === 0 && s3 === 0) resetGeo1Style();
      }

      lastScrollTime = now;
      lastS1 = s1; lastS2 = s2; lastS3 = s3; lastS4 = s4; lastS5 = s5; lastS6 = s6;

      if (s1 >= 0.98) tentHasBeenClosed = true;
    };

    let scrollTimeout;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
    
    const throttledScroll = () => {
      if (scrollTimeout) return;
      // Slightly reduce throttling on mobile for smoother experience
      const throttleTime = isMobile ? 6 : 8;
      scrollTimeout = setTimeout(() => {
        onScroll();
        scrollTimeout = null;
      }, throttleTime);
    };
    
    const onResize = () => {
      // Add a small delay for mobile orientation changes
      if (isMobile) {
        setTimeout(() => onScroll(), 100);
      } else {
        onScroll();
      }
    };

    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("scroll", throttledScroll, { passive: true });
      window.addEventListener("resize", onResize);

      // Initial camera: do a single "immediate" snap once so we start from a known baseline,
      // then all subsequent movements are smoothed.
      camQRef.current.reset();
      camQRef.current.queue(
        { position: new THREE.Vector3(3, 1.6, 3.4), target: new THREE.Vector3(0, 0.5, 0) },
        { baseDuration: 0, immediate: true }
      );

      ensureInitialOpenState();
      onScroll();

      return () => {
        window.removeEventListener("scroll", throttledScroll);
        window.removeEventListener("resize", onResize);
        if (scrollTimeout) clearTimeout(scrollTimeout);
        camQRef.current.reset();
      };
    }
  }, [api]);

  // --- if clips arrive late, ensure proper initialization (hook reserved) ---
  useEffect(() => {
    if (api.clipNames.length === 0) return;
  }, [api.clipNames]);

  return (
    <main className="relative z-10" style={{ touchAction: 'pan-y' }}>
      <div className="absolute inset-0 w-full h-full pointer-events-none"></div>
      <section className="px-6 py-16 max-w-3xl mx-auto relative z-20"></section>

      {/* Section 1: Open/Setup */}
      <section ref={sect1Ref} className="min-h-[120vh] md:min-h-[120vh] px-4 md:px-6 py-16 md:py-24 border-slate-800 relative z-20">
        <div></div>
      </section>

      {/* Section 2: Door */}
      <section ref={sect2Ref} className="min-h-[120vh] md:min-h-[120vh] px-4 md:px-6 py-16 md:py-24 border-slate-800 relative z-20">
        <div></div>
      </section>

      {/* Section 3: Mattress Animation */}
      <section ref={sect3Ref} className="min-h-[120vh] md:min-h-[120vh] px-4 md:px-6 py-16 md:py-24 border-slate-800 relative z-20">
        <div></div>
      </section>

      {/* Section 4: Side Animation */}
      <section ref={sect4Ref} className="min-h-[120vh] md:min-h-[120vh] px-4 md:px-6 py-16 md:py-24 border-slate-800 relative z-20">
        <div></div>
      </section>

      {/* Section 5: Flythrough */}
      <section ref={sect5Ref} className="min-h-[200vh] md:min-h-[250vh] px-4 md:px-6 py-16 md:py-24 border-slate-800 relative z-20">
        <div></div>
      </section>

      {/* Section 6: New Scene */}
      <section ref={sect6Ref} className="min-h-[120vh] md:min-h-[120vh] px-4 md:px-6 py-16 md:py-24 border-slate-800 relative z-20">
        <div></div>
      </section>

      <section className="px-4 md:px-6 py-16 md:py-24 border-slate-800 relative z-20">
        <div></div>
      </section>
    </main>
  );
}

/**
 * Interpolate between an array of poses with smooth Catmull–Rom curves and duration-aware timing.
 */
const _curveCache = new WeakMap();
function interpolatePose(poses, t) {
  if (!poses || poses.length === 0) return null;
  if (poses.length === 1) return poses[0];

  let rec = _curveCache.get(poses);
  if (!rec || rec.count !== poses.length) {
    const p = poses.map((p) => p.position.clone());
    const q = poses.map((p) => p.target.clone());
    const tension = 0.5; // centripetal
    const posCurve = new THREE.CatmullRomCurve3(p, false, "catmullrom", tension);
    const tarCurve = new THREE.CatmullRomCurve3(q, false, "catmullrom", tension);
    const durations = poses.map((p) => Math.max(0.0001, p.duration ?? 1));
    const total = durations.reduce((s, d) => s + d, 0);
    rec = { posCurve, tarCurve, durations, total, count: poses.length };
    _curveCache.set(poses, rec);
  }

  const { durations, total, posCurve, tarCurve } = rec;
  let targetTime = THREE.MathUtils.clamp(t, 0, 1) * total;
  let acc = 0;
  let i = 0;
  while (i < durations.length - 1 && acc + durations[i] < targetTime) {
    acc += durations[i];
    i++;
  }
  const localT = THREE.MathUtils.clamp((targetTime - acc) / durations[i], 0, 1);
  const u = (i + localT) / (durations.length - 1);

  return {
    position: posCurve.getPoint(u),
    target: tarCurve.getPoint(u),
    duration: durations[i],
  };
}

/** Utility: normalized progress 0..1 across a section's scroll span (returns 0 when offscreen) */
function progressFor(el) {
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  if (rect.bottom <= 0 || rect.top >= vh) return 0;
  const h = rect.height || 1;
  const p = -rect.top / h;
  return Math.max(0, Math.min(1, p));
}

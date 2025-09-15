import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { useAnimationAPI } from "../hooks/useAnimationAPI";

/* =========================
 *  Camera pose helpers
 * ========================= */
const CAM_EPS = 0.005;    // minimum change before we send a new pose
const CAM_MIN_DUR = 0.6;  // seconds
const CAM_MAX_DUR = 4.0;  // seconds
const CAM_DIST_TO_DUR = 1.2;

function vec3From(v) {
  return v instanceof THREE.Vector3 ? v.clone() : new THREE.Vector3().fromArray(Array.isArray(v) ? v : [0,0,0]);
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
    window.dispatchEvent(new CustomEvent("setCameraPose", { detail: { position: pos, target: tar, duration, immediate } }));
  };

  const flush = () => {
    state.raf = 0;
    if (!state.pending) return;

    const { pose, baseDuration = 2.0, immediate = false } = state.pending;
    const delta = poseDistance(state.lastSent, pose);

    if (!state.lastSent || delta > CAM_EPS) {
      const durFromDelta = THREE.MathUtils.clamp(delta * CAM_DIST_TO_DUR, CAM_MIN_DUR, CAM_MAX_DUR);
      const finalDuration = Math.max(baseDuration ?? 0, durFromDelta);
      dispatch({ ...pose, duration: immediate ? 0 : finalDuration, immediate });
      state.lastSent = { position: vec3From(pose.position), target: vec3From(pose.target), duration: finalDuration };
    }
    state.pending = null;
  };

  return {
    queue(pose, opts = {}) {
      state.pending = { pose, ...opts };
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
    },
  };
}

/* =========================
 *  Universal Animation System (JS)
 * ========================= */
function createAnimator(api) {
  const tweens = new Map();

  function scrub(entries, exclusive = true) {
    if (!entries || entries.length === 0) return;
    api.scrub(entries, exclusive);
  }

  function tweenTo(name, from, to, ms) {
    const existing = tweens.get(name);
    if (existing) existing.cancel();

    let raf = 0;
    const start = performance.now();
    const loop = () => {
      const now = performance.now();
      const p = Math.min(1, (now - start) / ms);
      const t = from + (to - from) * p;
      api.scrub([{ name, t }], false); // non-exclusive
      if (p < 1) {
        raf = requestAnimationFrame(loop);
      } else {
        tweens.delete(name);
      }
    };
    raf = requestAnimationFrame(loop);

    const cancel = () => {
      if (raf) cancelAnimationFrame(raf);
      tweens.delete(name);
    };
    tweens.set(name, { cancel });
  }

  function cancel(name) {
    const tw = tweens.get(name);
    if (tw) tw.cancel();
  }

  function cancelAll() {
    tweens.forEach(({ cancel }) => cancel());
    tweens.clear();
  }

  return { scrub, tweenTo, cancel, cancelAll };
}

/* =========================
 *  Predefined camera path
 * ========================= */
const FLY_POSES = [
  { position: new THREE.Vector3(0, 0.8, -7), target: new THREE.Vector3(0, 0.5, 0), moveDuration: .1, holdDuration: 0 },
  { position: new THREE.Vector3(0, 0.5, -1.4), target: new THREE.Vector3(0, 2, 0), moveDuration: .2, holdDuration: 1.2 },
  { position: new THREE.Vector3(0, 0.5, -1.4), target: new THREE.Vector3(0, 2, 0), moveDuration: 0, holdDuration: 0 },
];

/* =========================
 *  Scroll → Animation/Camera
 * ========================= */
export function ScrollSections() {
  const api = useAnimationAPI();

  // sections
  const sect1Ref = useRef(null);
  const sect2Ref = useRef(null);
  const sect3Ref = useRef(null);
  const sect4Ref = useRef(null);
  const sect5Ref = useRef(null);
  const sect6Ref = useRef(null);

  // names/state
  const doorNameRef = useRef(null);
  const appliedGeo1Ref = useRef(false);
  const section6AnimTriggered = useRef(false);
  const section6AnimationRef = useRef(null);
  const section5FlythroughRef = useRef({ triggered: false, startTime: 0, currentPose: 0 });

  // systems
  const camQRef = useRef(null);
  const animatorRef = useRef(null);
  if (!camQRef.current) camQRef.current = createCameraQueue();
  if (!animatorRef.current) animatorRef.current = createAnimator(api);

  // helpers (materials/visibility)
  const setGeo1Style = (active) => {
    if (!api.group?.current) return;
    api.group.current.traverse((child) => {
      if (child.name === "geo1" && child.material) {
        const setMat = (m) => {
          m.transparent = active;
          m.opacity = active ? 0.5 : 1.0;
          m.color.setHex(active ? 0xc39718 : 0xffffff);
          m.needsUpdate = true;
        };
        Array.isArray(child.material) ? child.material.forEach(setMat) : setMat(child.material);
      }
    });
    appliedGeo1Ref.current = active;
  };
  const show3in = (on) => {
    if (!api.group?.current) return;
    api.group.current.traverse((child) => {
      if (child.name === "3in") child.visible = on;
    });
  };

  // pick a door clip when names arrive
  useEffect(() => {
    if (!api.clipNames || api.clipNames.length === 0) return;
    const door = api.clipNames.find((n) => n.toLowerCase().includes("door") || n === "Door");
    doorNameRef.current = door || null;
  }, [api.clipNames]);

  useEffect(() => {
    const animator = animatorRef.current;
    const camQ = camQRef.current;

    let lastScrollTime = 0;
    let lastSection = -1;
    let lastActiveCamera = null;
    let tentHasBeenClosed = false;

    let lastS1 = 0, lastS2 = 0, lastS3 = 0, lastS4 = 0, lastS5 = 0, lastS6 = 0;

    const ensureInitialOpenState = () => {
      if (api.clipNames.length > 0) {
        const openEntries = [];
        if (api.clipNames.includes("animation0")) openEntries.push({ name: "animation0", t: 1 });
        if (api.clipNames.includes("TentOPENCLOSE")) openEntries.push({ name: "TentOPENCLOSE", t: 1 });
        if (openEntries.length > 0) animator.scrub(openEntries, true);
      }
      show3in(false);
    };

    const queueCam = (pose, opts = {}) => camQ.queue(pose, opts);

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
        Math.abs(s1 - lastS1), Math.abs(s2 - lastS2), Math.abs(s3 - lastS3),
        Math.abs(s4 - lastS4), Math.abs(s5 - lastS5), Math.abs(s6 - lastS6)
      );
      const isFastScroll = deltaTime > 0 && maxDelta / deltaTime > 0.001;

      // active section?
      let currentSection = -1;
      if (s1 > 0 && s1 <= 1) currentSection = 1;
      else if (s2 > 0 && s2 <= 1) currentSection = 2;
      else if (s3 > 0 && s3 <= 1) currentSection = 3;
      else if (s4 > 0 && s4 <= 1) currentSection = 4;
      else if (s5 > 0 && s5 <= 1) currentSection = 5;
      else if (s6 > 0 && s6 <= 1) currentSection = 6;

      const isInTransition = currentSection === -1 && (s1 > 0 || s2 > 0 || s3 > 0 || s4 > 0 || s5 > 0 || s6 > 0);

      if (currentSection !== lastSection) {
        window.dispatchEvent(new CustomEvent("sectionChange", { detail: { section: currentSection } }));
        lastSection = currentSection;
      }

      const E = [];

      // 1: Open/Setup (reversed)
      if (s1 > 0 && s1 <= 1) {
        setGeo1Style(false);
        show3in(false);
        const tRev = Math.max(0, 1 - s1);
        if (api.clipNames.includes("animation0")) E.push({ name: "animation0", t: tRev });
        if (api.clipNames.includes("TentOPENCLOSE")) E.push({ name: "TentOPENCLOSE", t: tRev });
        if (s1 >= 0.98) {
          if (api.clipNames.includes("animation0")) E.push({ name: "animation0", t: 0 });
          if (api.clipNames.includes("TentOPENCLOSE")) E.push({ name: "TentOPENCLOSE", t: 0 });
        }
        const pose = { position: new THREE.Vector3(3.2, 1.7, -3.6), target: new THREE.Vector3(0, 0.5, 0) };
        queueCam(pose, { baseDuration: isFastScroll ? 1.2 : 3.5 });
        lastActiveCamera = pose;
      }

      // 2: Door + BackWindow
      const door = doorNameRef.current;
      if (s2 > 0 && s2 <= 1) {
        setGeo1Style(true);
        show3in(false);
        if (door) E.push({ name: door, t: s2 });
        if (api.clipNames.includes("BackWindow")) E.push({ name: "BackWindow", t: s2 });
        const pose = { position: new THREE.Vector3(1.7, 1.15, -1.05), target: new THREE.Vector3(-0.7, 0.9, 0) };
        queueCam(pose, { baseDuration: isFastScroll ? 1.0 : 3.0 });
        lastActiveCamera = pose;
      }

      // 3: Mattress (same cam as 2)
      if (s3 > 0 && s3 <= 1) {
        setGeo1Style(true);
        show3in(true);
        const pose = { position: new THREE.Vector3(1.7, 1.15, -1.05), target: new THREE.Vector3(-0.7, 0.9, 0) };
        queueCam(pose, { baseDuration: isFastScroll ? 1.0 : 3.0 });
        lastActiveCamera = pose;
      }

      // 4: Side
      if (s4 > 0 && s4 <= 1) {
        show3in(false);
        if (api.clipNames.includes("Side")) E.push({ name: "Side", t: s4 });
        const pose = { position: new THREE.Vector3(0, 1.5, -5), target: new THREE.Vector3(0, 0, 0) };
        queueCam(pose, { baseDuration: isFastScroll ? 1.2 : 3.5 });
        lastActiveCamera = pose;
      }

      // 5: Flythrough - Cinematic sequence independent of scroll speed
      if (s5 > 0 && s5 <= 1) {
        show3in(false);
        setGeo1Style(false); // Ensure geo1 has opacity = 1.0 for flythrough
        if (api.clipNames.includes("Door")) E.push({ name: "Door", t: 1 });
        if (api.clipNames.includes("BackWindow")) E.push({ name: "BackWindow", t: 1 });
        if (api.clipNames.includes("Side")) E.push({ name: "Side", t: 1 });

        // Trigger cinematic flythrough once when entering section 5
        if (!section5FlythroughRef.current.triggered) {
          section5FlythroughRef.current.triggered = true;
          section5FlythroughRef.current.startTime = performance.now();
          section5FlythroughRef.current.currentPose = 0;
          
          // Start the cinematic sequence
          const runCinematicFlythrough = () => {
            const now = performance.now();
            const elapsed = (now - section5FlythroughRef.current.startTime) / 1000; // seconds
            const flythrough = section5FlythroughRef.current;
            
            if (flythrough.currentPose >= FLY_POSES.length) {
              return; // Sequence complete
            }
            
            const currentPoseData = FLY_POSES[flythrough.currentPose];
            let totalTimeForThisPose = 0;
            
            // Calculate total time used by previous poses
            for (let i = 0; i < flythrough.currentPose; i++) {
              totalTimeForThisPose += FLY_POSES[i].moveDuration + FLY_POSES[i].holdDuration;
            }
            
            const timeInCurrentPose = elapsed - totalTimeForThisPose;
            
            if (timeInCurrentPose <= currentPoseData.moveDuration) {
              // Currently moving to this pose
              queueCam(
                { 
                  position: currentPoseData.position, 
                  target: currentPoseData.target 
                }, 
                { 
                  baseDuration: currentPoseData.moveDuration,
                  immediate: false 
                }
              );
            } else if (timeInCurrentPose <= currentPoseData.moveDuration + currentPoseData.holdDuration) {
              // Currently holding at this pose - keep camera steady
              queueCam(
                { 
                  position: currentPoseData.position, 
                  target: currentPoseData.target 
                }, 
                { 
                  baseDuration: 0.1, // Small duration to maintain position
                  immediate: false 
                }
              );
            } else {
              // Move to next pose
              flythrough.currentPose++;
            }
            
            // Continue the sequence if still in section 5 and not complete
            if (s5 > 0 && flythrough.currentPose < FLY_POSES.length) {
              requestAnimationFrame(runCinematicFlythrough);
            }
          };
          
          runCinematicFlythrough();
        }
        
        // Update lastActiveCamera for reference
        if (section5FlythroughRef.current.currentPose < FLY_POSES.length) {
          const currentPose = FLY_POSES[section5FlythroughRef.current.currentPose];
          lastActiveCamera = { position: currentPose.position, target: currentPose.target };
        }
      }

      // 6: Return / close Side + BackWindow over 2s, reset others
      if (s6 > 0 && s6 <= 1) {
        show3in(false);
        setGeo1Style(false);

        if (!section6AnimTriggered.current) {
          section6AnimTriggered.current = true;

          const sideAnim = api.clipNames.includes("Side") ? "Side" : null;
          const backWindowAnim = api.clipNames.includes("BackWindow") ? "BackWindow" : null;

          if (backWindowAnim) animator.tweenTo(backWindowAnim, 1, 0, 2000);
          if (sideAnim) animator.tweenTo(sideAnim, 1, 0, 2000);
        }

        // Ensure BackWindow and Side are closed in Section 6
        if (api.clipNames.includes("BackWindow")) E.push({ name: "BackWindow", t: 0 });
        if (api.clipNames.includes("Side")) E.push({ name: "Side", t: 0 });

        // Reset other animations immediately
        if (api.clipNames.includes("animation0")) E.push({ name: "animation0", t: 0 });
        if (api.clipNames.includes("TentOPENCLOSE")) E.push({ name: "TentOPENCLOSE", t: 0 });

        const d = doorNameRef.current;
        if (d) E.push({ name: d, t: 0 });

        const pose = { position: new THREE.Vector3(3, 1.6, 3.4), target: new THREE.Vector3(0, 0.5, 0) };
        queueCam(pose, { baseDuration: isFastScroll ? 1.5 : 4.0 });
        lastActiveCamera = pose;
      }

      if (s6 === 0 && section6AnimTriggered.current) {
        section6AnimTriggered.current = false;
        section6AnimationRef.current = null;
      }
      
      // Reset Section 5 flythrough when leaving section 5
      if (s5 === 0 && section5FlythroughRef.current.triggered) {
        section5FlythroughRef.current.triggered = false;
        section5FlythroughRef.current.startTime = 0;
        section5FlythroughRef.current.currentPose = 0;
      }

      if (E.length > 0) {
        animator.scrub(E, true);
      } else {
        if (tentHasBeenClosed && s2 === 0 && s3 === 0 && s4 === 0 && s5 === 0 && s6 === 0) {
          const closeEntries = [];
          if (api.clipNames.includes("animation0")) closeEntries.push({ name: "animation0", t: 0 });
          if (api.clipNames.includes("TentOPENCLOSE")) closeEntries.push({ name: "TentOPENCLOSE", t: 0 });
          if (closeEntries.length > 0) animator.scrub(closeEntries, true);
          else window.dispatchEvent(new Event("clearScrub"));
        } else {
          window.dispatchEvent(new Event("clearScrub"));
        }

        const allInactive = s1 === 0 && s2 === 0 && s3 === 0 && s4 === 0 && s5 === 0 && s6 === 0;
        if (allInactive && !isInTransition) {
          show3in(false);
          const pose = { position: new THREE.Vector3(3, 1.6, 3.4), target: new THREE.Vector3(0, 0.5, 0) };
          queueCam(pose, { baseDuration: 4.0 });
          lastActiveCamera = pose;
        }
        if (s2 === 0 && s3 === 0 && appliedGeo1Ref.current) setGeo1Style(false);
      }

      lastScrollTime = now;
      lastS1 = s1; lastS2 = s2; lastS3 = s3; lastS4 = s4; lastS5 = s5; lastS6 = s6;
      if (s1 >= 0.98) tentHasBeenClosed = true;
    };

    // throttle scroll handler
    let scrollTimeout;
    const throttledScroll = () => {
      if (scrollTimeout) return;
      scrollTimeout = setTimeout(() => {
        onScroll();
        scrollTimeout = null;
      }, 8);
    };

    const onResize = () => onScroll();

    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("scroll", throttledScroll, { passive: true });
      window.addEventListener("resize", onResize);

      // baseline camera: immediate snap to idle
      camQ.reset();
      camQ.queue(
        { position: new THREE.Vector3(3, 1.6, 3.4), target: new THREE.Vector3(0, 0.5, 0) },
        { baseDuration: 0, immediate: true }
      );

      ensureInitialOpenState();
      onScroll();

      return () => {
        window.removeEventListener("scroll", throttledScroll);
        window.removeEventListener("resize", onResize);
        if (scrollTimeout) clearTimeout(scrollTimeout);
        camQ.reset();
        animator.cancelAll();
      };
    }
  }, [api]);

  // (Optional) live tick; placeholder to mirror tween state if you later store it
  useEffect(() => {
    let raf = 0;
    const tick = () => { raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, []);

  return (
    <main className="relative z-10">
      <div className="absolute inset-0 w-full h-full" />
      <section className="px-6 py-16 max-w-3xl mx-auto relative z-20" />
      {/* 1 */}
      <section ref={sect1Ref} className="min-h-[120vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>
      {/* 2 */}
      <section ref={sect2Ref} className="min-h-[120vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>
      {/* 3 */}
      <section ref={sect3Ref} className="min-h-[120vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>
      {/* 4 */}
      <section ref={sect4Ref} className="min-h-[120vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>
      {/* 5 */}
      <section ref={sect5Ref} className="min-h-[350vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>
      {/* 6 */}
      <section ref={sect6Ref} className="min-h-[120vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>
      <section className="px-6 py-24 border-slate-800 relative z-20"><div /></section>
    </main>
  );
}

/* =========================
 *  Pose interpolation (JS)
 * ========================= */
const _curveCache = new WeakMap();
function interpolatePose(poses, t) {
  if (!poses || poses.length === 0) return null;
  if (poses.length === 1) return { ...poses[0], duration: poses[0].duration ?? 1 };

  let rec = _curveCache.get(poses);
  if (!rec || rec.count !== poses.length) {
    const p = poses.map((pp) => pp.position.clone());
    const q = poses.map((pp) => pp.target.clone());
    const tension = 0.5;
    const posCurve = new THREE.CatmullRomCurve3(p, false, "catmullrom", tension);
    const tarCurve = new THREE.CatmullRomCurve3(q, false, "catmullrom", tension);
    const durations = poses.map((pp) => Math.max(0.0001, pp.duration ?? 1));
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

/* =========================
 *  Section progress helper
 * ========================= */
function progressFor(el) {
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  if (rect.bottom <= 0 || rect.top >= vh) return 0;
  const h = rect.height || 1;
  const p = -rect.top / h;
  return Math.max(0, Math.min(1, p));
}

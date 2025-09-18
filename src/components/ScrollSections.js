import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { useAnimationAPI } from "../hooks/useAnimationAPI";

/* =========================
 * Camera pose helpers
 * ========================= */
const CAM_EPS = 0.005;
const CAM_MIN_DUR = 0.6;
const CAM_MAX_DUR = 4.0;
const CAM_DIST_TO_DUR = 1.2;

function vec3From(v) {
  return v instanceof THREE.Vector3 ? v.clone() : new THREE.Vector3().fromArray(Array.isArray(v) ? v : [0, 0, 0]);
}
function poseDistance(a, b) {
  if (!a || !b) return Infinity;
  const ap = vec3From(a.position), at = vec3From(a.target);
  const bp = vec3From(b.position), bt = vec3From(b.target);
  return ap.distanceTo(bp) + at.distanceTo(bt);
}
function createCameraQueue() {
  const state = { lastSent: null, pending: null, raf: 0 };
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
    get last() { return state.lastSent; },
  };
}

/* =========================
 * Universal Animator (time-based)
 * ========================= */
function createAnimator(api) {
  const tweens = new Map(); // name -> { cancel }
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
      api.scrub([{ name, t }], false);
      if (p < 1) raf = requestAnimationFrame(loop);
      else tweens.delete(name);
    };
    raf = requestAnimationFrame(loop);
    const cancel = () => { if (raf) cancelAnimationFrame(raf); tweens.delete(name); };
    tweens.set(name, { cancel });
  }
  function cancel(name) { const tw = tweens.get(name); if (tw) tw.cancel(); }
  function cancelAll() { tweens.forEach(({ cancel }) => cancel()); tweens.clear(); }
  return { scrub, tweenTo, cancel, cancelAll };
}

/* =========================
 * Helpers that touch your scene graph (unchanged behavior)
 * ========================= */
function makeSetGeo1Style(api) {
  return (active) => {
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
  };
}
function makeShow3in(api) {
  return (on) => {
    if (!api.group?.current) return;
    api.group.current.traverse((child) => {
      if (child.name === "3in") child.visible = on;
    });
  };
}

/* =========================
 * Clip resolution helpers
 * ========================= */
function resolveClipName(requested, clipNames) {
  if (!requested || !clipNames) return null;
  if (clipNames.includes(requested)) return requested;
  const lower = requested.toLowerCase();
  return clipNames.find((c) => c.toLowerCase().includes(lower)) || null;
}

/* =========================
 * Camera flythrough poses (Section 5)
 * ========================= */
const FLY_POSES = [
  { position: new THREE.Vector3(0, 0.8, -7),   target: new THREE.Vector3(0, 0.5, 0), moveDuration: 0.1, holdDuration: 0.1 },
  { position: new THREE.Vector3(0, 0.5, -1.4), target: new THREE.Vector3(0, 2,   0), moveDuration: 0.1, holdDuration: .1 },
  { position: new THREE.Vector3(0, 0.5, -1.4), target: new THREE.Vector3(0, 2,   0), moveDuration: 0,  holdDuration: 0.1 },
];

/* =========================================================
 * CONFIG: Define what each section does (clips & camera)
 * mode: "scrub" = map scroll progress to clip t (0..1)
 *       "tween" = time-based play once per entry (from->to)
 *       "snap"  = force a fixed t while in the section
 * camera.mode: "fixed" | "timeline"
 * ========================================================= */
function buildSectionDefs(api, utils) {
  const { setGeo1Style, show3in, resolve } = utils;
  const door = resolve("Door"); // fuzzy door name once
  // Try to resolve tent animation with multiple name variations
  const tentOpenClose = resolve("TentOPENCLOSE") || resolve("tentOpenClose") || resolve("TentOpenClose");
  
  return [
    /* ===== 1. Open/Setup (reversed like before) ===== */
    {
      id: 1,
      label: "Open/Setup",
      actions: [
        { mode: "scrub", clip: resolve("animation0"), map: (s) => Math.max(0, 1 - s) },
        { mode: "scrub", clip: tentOpenClose, map: (s) => Math.max(0, 1 - s) },
        // hard clamp to fully closed near the end (same as your ≥0.98)
        { mode: "snap",  clip: resolve("animation0"), when: (s) => s >= 0.98, t: 0 },
        { mode: "snap",  clip: tentOpenClose, when: (s) => s >= 0.98, t: 0 },
      ],
      onEnter: () => { setGeo1Style(false); show3in(false); },
      onUpdate: () => {},
      onExit: () => {},
      camera: {
        mode: "fixed",
        getPose: () => ({ position: new THREE.Vector3(3.2, 1.7, -3.6), target: new THREE.Vector3(0, 0.5, 0) }),
        baseDuration: (_, fast) => (fast ? 1.2 : 3.5),
      },
    },

    /* ===== 2. Door + BackWindow (scroll-scrub) ===== */
    {
      id: 2,
      label: "Door & BackWindow",
      actions: [
        { mode: "scrub", clip: door,                map: (s) => s },
        // { mode: "scrub", clip: resolve("BackWindow"), map: (s) => s }, removed back window for animation 
      ],
      onEnter: () => { setGeo1Style(true); show3in(false); },
      onUpdate: () => {},
      onExit: () => {},
      camera: {
        mode: "fixed",
        getPose: () => ({ position: new THREE.Vector3(1.7, 1.15, -1.05), target: new THREE.Vector3(-0.7, 0.9, 0) }),
        baseDuration: (_, fast) => (fast ? 1.0 : 3.0),
      },
    },

    /* ===== 3. Mattress (same camera as 2, show 3in) ===== */
    {
      id: 3,
      label: "Mattress",
      actions: [],
      onEnter: () => { setGeo1Style(true); show3in(true); },
      onUpdate: () => {},
      onExit: () => { show3in(false); },
      camera: {
        mode: "fixed",
        getPose: () => ({ position: new THREE.Vector3(1.7, 1.15, -1.05), target: new THREE.Vector3(-0.7, 0.9, 0) }),
        baseDuration: (_, fast) => (fast ? 1.0 : 3.0),
      },
    },

    /* ===== 4. Side (scroll-scrub) ===== */
    {
      id: 4,
      label: "Side",
      actions: [
        { mode: "scrub", clip: resolve("Side"), map: (s) => s },
      ],
      onEnter: () => { show3in(false); },
      onUpdate: () => {},
      onExit: () => {},
      camera: {
        mode: "fixed",
        getPose: () => ({ position: new THREE.Vector3(0, 1.5, -5), target: new THREE.Vector3(0, 0, 0) }),
        baseDuration: (_, fast) => (fast ? 1.2 : 3.5),
      },
    },

    /* ===== 5. Cinematic flythrough (independent of scroll) ===== */
    {
      id: 5,
      label: "Flythrough",
      actions: [
        // hold these open while in the section
        { mode: "snap", clip: door, t: 1 },
        { mode: "snap", clip: resolve("BackWindow"), t: 1 },
        { mode: "snap", clip: resolve("Side"), t: 1 },
      ],
      onEnter: () => { setGeo1Style(false); show3in(false); },
      onUpdate: () => {},
      onExit: () => {},
      camera: {
        mode: "timeline",
        poses: FLY_POSES,
      },
    },

    /* ===== 6. Return/Close side + back window (tween on enter) ===== */
    {
      id: 6,
      label: "Return/Close",
      actions: [
        // Kick off time-based closes once when we ENTER section 6 (same as your tweenTo)
        { mode: "tween", clip: resolve("BackWindow"), from: 1, to: 0, ms: 2000, trigger: "enter" },
        { mode: "tween", clip: resolve("Side"),       from: 1, to: 0, ms: 2000, trigger: "enter" },

        // And keep everything closed while we stay here
        // { mode: "snap", clip: resolve("BackWindow"), t: 0 },
        // { mode: "snap", clip: resolve("Side"),       t: 0 },

        // Reset other animations immediately (like before)
        { mode: "snap", clip: resolve("animation0"),    t: 1 },
        { mode: "snap", clip: tentOpenClose, t: 1 },
        // { mode: "snap", clip: door,                     t: 0 },
      ],
      onEnter: () => { setGeo1Style(false); show3in(false); },
      onUpdate: () => {},
      onExit: () => {},
      camera: {
        mode: "fixed",
        getPose: () => ({ position: new THREE.Vector3(3, 1.6, 3.4), target: new THREE.Vector3(0, 0.5, 0) }),
        baseDuration: (_, fast) => (fast ? 1.5 : 4.0),
      },
    },
  ];
}

/* =========================
 * ScrollSections (config-driven)
 * ========================= */
export function ScrollSections() {
  const api = useAnimationAPI();

  // section refs
  const sectRefs = {
    1: useRef(null),
    2: useRef(null),
    3: useRef(null),
    4: useRef(null),
    5: useRef(null),
    6: useRef(null),
  };

  // systems
  const camQRef = useRef(null);
  const animatorRef = useRef(null);
  if (!camQRef.current) camQRef.current = createCameraQueue();
  if (!animatorRef.current) animatorRef.current = createAnimator(api);

  // per-run state
  const triggeredTweensRef = useRef(new Set()); // `${sectionId}:${clip}`
  const section5RunnerRef = useRef({ running: false, start: 0, i: 0 });

  // helpers that depend on api
  const setGeo1Style = makeSetGeo1Style(api);
  const show3in = makeShow3in(api);
  const resolve = (name) => resolveClipName(name, api.clipNames || []);

  // initial "open" state - set animation0 and tentOpenClose to t:0.98 on page load
  const ensureInitialOpenState = () => {
    const entries = [];
    const a0 = resolve("animation0");
    // Try both variations of tent open/close animation name
    const oc = resolve("TentOPENCLOSE") || resolve("tentOpenClose") || resolve("TentOpenClose");
    
    console.log("Setting initial state - Available clips:", api.clipNames);
    console.log("Resolved animation0:", a0);
    console.log("Resolved tent animation:", oc);
    
    if (a0) entries.push({ name: a0, t: 0.98 });
    if (oc) entries.push({ name: oc, t: 0.98 });
    
    console.log("Initial state entries:", entries);
    
    if (entries.length) {
      animatorRef.current.scrub(entries, true);
      console.log("Applied initial state scrub");
    }
    show3in(false);
  };

  // build section config
  const SECTION_DEFS = buildSectionDefs(api, { setGeo1Style, show3in, resolve });

  // camera helpers
  const queueCam = (pose, opts = {}) => camQRef.current.queue(pose, opts);

  // section 5 camera timeline engine (time-based)
  function startFlythrough() {
    const runner = section5RunnerRef.current;
    console.log("Starting flythrough animation");
    runner.running = true;
    runner.start = performance.now();
    runner.i = 0;

    const step = () => {
      if (!runner.running) return;
      const elapsed = (performance.now() - runner.start) / 1000;
      let tUsed = 0;
      for (let k = 0; k < FLY_POSES.length; k++) {
        const seg = FLY_POSES[k];
        const segLen = seg.moveDuration + seg.holdDuration;
        if (elapsed < tUsed + segLen) {
          runner.i = k;
          const inSeg = elapsed - tUsed;
          const moving = inSeg <= seg.moveDuration;
          console.log(`Flythrough step ${k}, elapsed: ${elapsed.toFixed(2)}s, moving: ${moving}`);
          queueCam(
            { position: seg.position, target: seg.target },
            { baseDuration: moving ? seg.moveDuration : 0.1, immediate: false }
          );
          requestAnimationFrame(step);
          return;
        }
        tUsed += segLen;
      }
      console.log("Flythrough completed");
      runner.running = false;
    };
    requestAnimationFrame(step);
  }
  function stopFlythrough() {
    console.log("Stopping flythrough animation");
    section5RunnerRef.current.running = false;
  }

  // scroll orchestration
  useEffect(() => {
    if (!api || !api.clipNames || api.clipNames.length === 0) return;
    const animator = animatorRef.current;
    const camQ = camQRef.current;

    // baseline camera: immediate snap to idle
    camQ.reset();
    queueCam(
      { position: new THREE.Vector3(3, 1.6, 3.4), target: new THREE.Vector3(0, 0.5, 0) },
      { baseDuration: 0, immediate: true }
    );

    // Set initial state to 0.98 once animations are available
    // Add a small delay to ensure animation system is fully ready
    setTimeout(() => {
      ensureInitialOpenState();
    }, 0);

    let lastScrollTime = 0;
    let lastProgress = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    let lastSection = -1;

    const onScroll = () => {
      const now = performance.now();
      const p = {
        1: progressFor(sectRefs[1].current),
        2: progressFor(sectRefs[2].current),
        3: progressFor(sectRefs[3].current),
        4: progressFor(sectRefs[4].current),
        5: progressFor(sectRefs[5].current),
        6: progressFor(sectRefs[6].current),
      };

      // current section detection
      let currentSection = -1;
      for (let i = 1; i <= 6; i++) {
        if (p[i] > 0 && p[i] <= 1) { currentSection = i; break; }
      }
      const anyActive = Object.values(p).some(v => v > 0);
      const isInTransition = currentSection === -1 && anyActive;

      if (currentSection !== lastSection) {
        console.log(`Section changed from ${lastSection} to ${currentSection}`);
        window.dispatchEvent(new CustomEvent("sectionChange", { detail: { section: currentSection } }));
        // handle enter/exit triggers
        if (lastSection > 0) SECTION_DEFS[lastSection - 1].onExit?.();
        if (currentSection > 0) {
          SECTION_DEFS[currentSection - 1].onEnter?.();
          // clear one-shot tween flags for this section (so re-entering can trigger again)
          [...triggeredTweensRef.current].forEach((key) => {
            if (key.startsWith(`${currentSection}:`)) triggeredTweensRef.current.delete(key);
          });
        }

        // section 5 camera runner
        if (currentSection === 5 && !section5RunnerRef.current.running) {
          console.log("Entering section 5, starting flythrough");
          startFlythrough();
        }
        if (lastSection === 5 && section5RunnerRef.current.running) {
          console.log("Leaving section 5, stopping flythrough");
          stopFlythrough();
        }

        lastSection = currentSection;
      }

      // scroll speed (for camera durations)
      const deltaTime = now - lastScrollTime;
      const diffs = [1, 2, 3, 4, 5, 6].map(i => Math.abs(p[i] - lastProgress[i]));
      const maxDelta = Math.max(...diffs);
      const isFast = deltaTime > 0 && maxDelta / deltaTime > 0.001;

      // build animation scrubs/snaps for the active section
      let scrubs = [];
      if (currentSection > 0) {
        const def = SECTION_DEFS[currentSection - 1];
        def.onUpdate?.(p[currentSection]);

        // actions
        for (const act of def.actions) {
          if (!act.clip) continue;

          if (act.mode === "scrub") {
            const t = THREE.MathUtils.clamp(act.map(p[currentSection] ?? 0), 0, 1);
            scrubs.push({ name: act.clip, t });
          } else if (act.mode === "snap") {
            const cond = act.when ? !!act.when(p[currentSection]) : true;
            if (cond) scrubs.push({ name: act.clip, t: THREE.MathUtils.clamp(act.t ?? 0, 0, 1) });
          } else if (act.mode === "tween") {
            const trig = act.trigger || "enter"; // "enter" | "always"
            const key = `${def.id}:${act.clip}`;
            const shouldStart = trig === "enter"
              ? (p[currentSection] > 0 && !triggeredTweensRef.current.has(key))
              : true;
            if (shouldStart) {
              triggeredTweensRef.current.add(key);
              animator.tweenTo(act.clip, act.from ?? 0, act.to ?? 1, act.ms ?? 1000);
            }
          }
        }

        // camera per section
        if (def.camera?.mode === "fixed") {
          const pose = def.camera.getPose(p[currentSection]);
          queueCam(pose, { baseDuration: def.camera.baseDuration?.(p[currentSection], isFast) ?? 2.0 });
        }
      }

      // section 5 camera timeline handled separately (running only while in 5)
      // send scrubs (exclusive)
      if (scrubs.length) animator.scrub(scrubs, true);
      else window.dispatchEvent(new Event("clearScrub"));

      // idle camera when nothing is active and not transitioning
      if (!anyActive && !isInTransition) {
        const idle = { position: new THREE.Vector3(3, 1.6, 3.4), target: new THREE.Vector3(0, 0.5, 0) };
        queueCam(idle, { baseDuration: 4.0 });
      }

      lastScrollTime = now;
      lastProgress = p;
    };

    // wire events
    let scrollTimeout;
    const throttledScroll = () => {
      if (scrollTimeout) return;
      scrollTimeout = setTimeout(() => { onScroll(); scrollTimeout = null; }, 8);
    };
    const onResize = () => onScroll();

    window.addEventListener("scroll", throttledScroll, { passive: true });
    window.addEventListener("resize", onResize);

    // kick
    onScroll();

    return () => {
      window.removeEventListener("scroll", throttledScroll);
      window.removeEventListener("resize", onResize);
      if (scrollTimeout) clearTimeout(scrollTimeout);
      camQ.reset();
      animator.cancelAll();
      stopFlythrough();
    };
  }, [api]); // rebind when clipNames/group change

  // passive tick (kept for parity/future state mirrors)
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
      {/* 1..6: same layout as before */}
      <section ref={sectRefs[1]} className="min-h-[120vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>
      <section ref={sectRefs[2]} className="min-h-[120vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>
      <section ref={sectRefs[3]} className="min-h-[120vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>
      <section ref={sectRefs[4]} className="min-h-[120vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>
      <section ref={sectRefs[5]} className="min-h-[350vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>
      <section ref={sectRefs[6]} className="min-h-[120vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>
      <section className="px-6 py-24 border-slate-800 relative z-20"><div /></section>
    </main>
  );
}

/* =========================
 * Section progress helper
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

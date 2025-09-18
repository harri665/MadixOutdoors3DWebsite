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
  function scrub(entries, exclusive = true) { if (entries?.length) api.scrub(entries, exclusive); }
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
      if (p < 1) { raf = requestAnimationFrame(loop); }
      else { tweens.delete(name); }
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
 * Helpers that touch your scene graph (with smooth transitions)
 * ========================= */
function makeSetGeo1Style(api) {
  const materialAnimations = new Map();
  return (active) => {
    if (!api.group?.current) return;
    api.group.current.traverse((child) => {
      if (child.name === "geo1" && child.material) {
        const setMat = (m) => {
          const targetOpacity = active ? 0.5 : 1.0;
          const targetColor = active ? 0xc39718 : 0xffffff;
          if (materialAnimations.has(m)) cancelAnimationFrame(materialAnimations.get(m));
          m.color.setHex(targetColor);
          const startOpacity = m.opacity;
          const startTime = performance.now();
          const duration = 300;
          const animateOpacity = (tNow) => {
            const elapsed = tNow - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
            const currentOpacity = startOpacity + (targetOpacity - startOpacity) * eased;
            m.opacity = currentOpacity;
            m.transparent = currentOpacity < 1.0;
            m.needsUpdate = true;
            if (progress < 1) {
              const id = requestAnimationFrame(animateOpacity);
              materialAnimations.set(m, id);
            } else {
              m.opacity = targetOpacity;
              m.transparent = targetOpacity < 1.0;
              m.needsUpdate = true;
              materialAnimations.delete(m);
            }
          };
          const id = requestAnimationFrame(animateOpacity);
          materialAnimations.set(m, id);
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
 * Camera flythrough poses (Section 7)
 * ========================= */
const FLY_POSES = [
  { position: new THREE.Vector3(0, 0.8, -7),   target: new THREE.Vector3(0, 0.5, 0), moveDuration: 0.1, holdDuration: 0.1 },
  { position: new THREE.Vector3(0, 0.5, -1.4), target: new THREE.Vector3(0, 2,   0), moveDuration: 0.1, holdDuration: .1 },
  { position: new THREE.Vector3(0, 0.5, -1.4), target: new THREE.Vector3(0, 2,   0), moveDuration: 0,  holdDuration: 0.1 },
];

/* =========================
 * Camera flythrough poses (Section 8)
 * ========================= */
const SECTION8_FLY_POSES = [
  { position: new THREE.Vector3(0, 0.5, -5), target: new THREE.Vector3(0, 0, 0), moveDuration: 1.5, holdDuration: 1.0 },
  { position: new THREE.Vector3(3, 0.5, -5), target: new THREE.Vector3(0, 0, 0), moveDuration: 0.1, holdDuration: 0 },
  { position: new THREE.Vector3(3, 1.6, 3.4), target: new THREE.Vector3(0, 0.5, 0), moveDuration: 4.0, holdDuration: 1.0 },
];

/* =========================================================
 * CONFIG: Define what each section does (clips & camera)
 * ========================================================= */
function buildSectionDefs(api, utils) {
  const { setGeo1Style, show3in, resolve, tentOpenClose } = utils;
  const door = resolve("Door");

  return [
    /* ===== 1. Open/Setup (reversed like before) ===== */
    {
      id: 1,
      label: "Open/Setup",
      actions: [
        { mode: "scrub", clip: resolve("animation0"), map: (s) => Math.max(0, 1 - s) },
        { mode: "scrub", clip: tentOpenClose,        map: (s) => Math.max(0, 1 - s) },
        { mode: "snap",  clip: resolve("animation0"), when: (s) => s >= 0.98, t: 0 },
        { mode: "snap",  clip: tentOpenClose,         when: (s) => s >= 0.98, t: 0 },
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

    /* ===== 2. Static (same camera as 1, NO animations) ===== */
    {
      id: 2,
      label: "Static Hold",
      actions: [],
      onEnter: () => { setGeo1Style(false); show3in(false); },
      onUpdate: () => {},
      onExit: () => {},
      camera: {
        mode: "fixed",
        getPose: () => ({ position: new THREE.Vector3(3.2, 1.7, -3.6), target: new THREE.Vector3(0, 0.5, 0) }),
        baseDuration: (_, fast) => (fast ? 1.2 : 3.5),
      },
    },

    /* ===== 3. Neutral (no door/backwindow here anymore) ===== */
    {
      id: 3,
      label: "Neutral",
      actions: [],
      onEnter: () => { setGeo1Style(true); show3in(false); },
      onUpdate: () => {},
      onExit: () => {},
      camera: {
        mode: "fixed",
        getPose: () => ({ position: new THREE.Vector3(1.7, 1.15, -1.05), target: new THREE.Vector3(-0.7, 0.9, -1) }),
        baseDuration: (_, fast) => (fast ? 1.0 : 3.0),
      },
    },

    /* ===== 4. Door Open (scroll-scrub) ===== */
    {
      id: 4,
      label: "Door Open",
      actions: [
        { mode: "scrub", clip: door, map: (s) => s },
      ],
      onEnter: () => { setGeo1Style(true); show3in(false); },
      onUpdate: () => {},
      onExit: () => {},
      camera: {
        mode: "fixed",
        getPose: () => ({ position: new THREE.Vector3(1.7, 1.15, -.8), target: new THREE.Vector3(-0.7, 0.9, -.8) }),
        baseDuration: (_, fast) => (fast ? 1.0 : 3.0),
      },
    },

    /* ===== 5. Side ONLY (scroll-scrub) ===== */
    {
      id: 5,
      label: "Side",
      actions: [
        // Stop Door and BackWindow, but play Side animation based on scroll
        { mode: "snap", clip: door, t: 0 },
        { mode: "snap", clip: resolve("BackWindow"), t: 0 },
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

    /* ===== 6. BackWindow Open (keep Side open; non-exclusive scrubs in loop) ===== */
    {
      id: 6,
      label: "BackWindow Open",
      actions: [
        { mode: "scrub", clip: resolve("BackWindow"), map: (s) => s },
        // IMPORTANT: We won't touch "Side" here; loop uses non-exclusive to preserve it.
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

    /* ===== 7. Cinematic flythrough (independent of scroll) ===== */
    {
      id: 7,
      label: "Flythrough",
      actions: [
        { mode: "snap", clip: door,                  t: 1 },
        { mode: "snap", clip: resolve("BackWindow"), t: 1 },
        { mode: "snap", clip: resolve("Side"),       t: 1 },
      ],
      onEnter: () => { setGeo1Style(false); show3in(false); },
      onUpdate: () => {},
      onExit: () => {},
      camera: { mode: "timeline", poses: FLY_POSES },
    },

    /* ===== 8. Return/Close (snap with timer progression) ===== */
    {
      id: 8,
      label: "Return/Close",
      actions: [
        { mode: "snap", clip: resolve("BackWindow"), t: 1 }, // will be driven by timer
        { mode: "snap", clip: resolve("Side"),       t: 1 }, // will be driven by timer
        { mode: "snap", clip: resolve("animation0"), t: 0.98 },
        { mode: "snap", clip: tentOpenClose,         t: 0.98 },
      ],
      onEnter: () => { setGeo1Style(false); show3in(false); },
      onUpdate: () => {},
      onExit: () => {},
      camera: { mode: "timeline", poses: SECTION8_FLY_POSES },
    },
  ];
}

/* =========================
 * ScrollSections (config-driven)
 * ========================= */
export function ScrollSections() {
  const api = useAnimationAPI();

  // section refs (1..8)
  const sectRefs = {
    1: useRef(null),
    2: useRef(null), // static section after 1
    3: useRef(null),
    4: useRef(null), // Door Open
    5: useRef(null), // Side ONLY
    6: useRef(null), // BackWindow Open (keep Side open)
    7: useRef(null), // Flythrough
    8: useRef(null), // Return/Close
  };

  // systems
  const camQRef = useRef(null);
  const animatorRef = useRef(null);
  if (!camQRef.current) camQRef.current = createCameraQueue();
  if (!animatorRef.current) animatorRef.current = createAnimator(api);

  // per-run state
  const triggeredTweensRef = useRef(new Set());
  const section7RunnerRef = useRef({ running: false, start: 0, i: 0 }); // Flythrough (7)
  const section8RunnerRef = useRef({ running: false, start: 0, i: 0 }); // Return/Close camera (8)
  const section8AnimRunnerRef = useRef({ running: false, start: 0 });   // Return/Close animation driver

  // helpers that depend on api
  const setGeo1Style = makeSetGeo1Style(api);
  const show3in = makeShow3in(api);
  const resolve = (name) => resolveClipName(name, api.clipNames || []);
  const tentOpenClose = resolve("TentOPENCLOSE") || resolve("tentOpenClose") || resolve("TentOpenClose");

  // initial "open" state
  const ensureInitialOpenState = () => {
    const entries = [];
    const a0 = resolve("animation0");
    const oc = resolve("TentOPENCLOSE") || resolve("tentOpenClose") || resolve("TentOpenClose");
    if (a0) entries.push({ name: a0, t: 0.98 });
    if (oc) entries.push({ name: oc, t: 0.98 });
    if (entries.length) animatorRef.current.scrub(entries, true);
    show3in(false);
  };

  // build section config
  const SECTION_DEFS = buildSectionDefs(api, { setGeo1Style, show3in, resolve, tentOpenClose });

  // camera helpers
  const queueCam = (pose, opts = {}) => camQRef.current.queue(pose, opts);

  // section 7 camera timeline engine
  function startFlythrough() {
    const runner = section7RunnerRef.current;
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
          queueCam(
            { position: seg.position, target: seg.target },
            { baseDuration: moving ? seg.moveDuration : 0.1, immediate: false }
          );
          requestAnimationFrame(step);
          return;
        }
        tUsed += segLen;
      }
      runner.running = false;
    };
    requestAnimationFrame(step);
  }
  function stopFlythrough() { section7RunnerRef.current.running = false; }

  // section 8 camera timeline engine
  function startSection8Flythrough() {
    const runner = section8RunnerRef.current;
    runner.running = true;
    runner.start = performance.now();
    runner.i = 0;

    const step = () => {
      if (!runner.running) return;
      const elapsed = (performance.now() - runner.start) / 1000;
      let tUsed = 0;
      for (let k = 0; k < SECTION8_FLY_POSES.length; k++) {
        const seg = SECTION8_FLY_POSES[k];
        const segLen = seg.moveDuration + seg.holdDuration;
        if (elapsed < tUsed + segLen) {
          runner.i = k;
          const inSeg = elapsed - tUsed;
          const moving = inSeg <= seg.moveDuration;
          queueCam(
            { position: seg.position, target: seg.target },
            { baseDuration: moving ? seg.moveDuration : 0.1, immediate: false }
          );
          requestAnimationFrame(step);
          return;
        }
        tUsed += segLen;
      }
      runner.running = false;
    };
    requestAnimationFrame(step);
  }
  function stopSection8Flythrough() { section8RunnerRef.current.running = false; }

  // section 8 animation runner
  function startSection8Animation() {
    const runner = section8AnimRunnerRef.current;
    if (runner.running) return;
    runner.running = true;
    runner.start = performance.now();

    const animator = animatorRef.current;

    const animationTimeline = [
      { clip: resolve("Door"),        startTime: 0,   duration: 1000, from: 1, to: 0 },
      { clip: resolve("BackWindow"),  startTime: 0,   duration: 2000, from: 1, to: 0 },
      { clip: resolve("Side"),        startTime: 200, duration: 2000, from: 1, to: 0 },
      { clip: tentOpenClose,          startTime: 600, duration: 1800, from: 0, to: 1 },
      { clip: resolve("animation0"),  startTime: 400, duration: 2000, from: 0, to: 1 },
    ].filter(anim => anim.clip);

    const step = () => {
      if (!runner.running) return;

      const elapsed = performance.now() - runner.start;
      const entries = [];
      let anyActive = false;

      for (const anim of animationTimeline) {
        const animElapsed = elapsed - anim.startTime;

        if (animElapsed >= 0) {
          if (animElapsed <= anim.duration) {
            anyActive = true;
            const progress = Math.min(animElapsed / anim.duration, 1);
            const t = anim.from + (anim.to - anim.from) * progress;
            entries.push({ name: anim.clip, t });
          } else {
            entries.push({ name: anim.clip, t: anim.to });
          }
        } else {
          entries.push({ name: anim.clip, t: anim.from });
        }
      }

      if (entries.length) animator.scrub(entries, false);
      if (anyActive) requestAnimationFrame(step);
      else runner.running = false;
    };

    requestAnimationFrame(step);
  }
  function stopSection8Animation() { section8AnimRunnerRef.current.running = false; }

  // scroll orchestration
  useEffect(() => {
    if (!api || !api.clipNames || api.clipNames.length === 0) return;
    const animator = animatorRef.current;
    const camQ = camQRef.current;

    window.scrollTo(0, 0);

    // baseline camera: immediate snap to idle
    camQ.reset();
    queueCam(
      { position: new THREE.Vector3(3, 1.6, 3.4), target: new THREE.Vector3(0, 0.5, 0) },
      { baseDuration: 0, immediate: true }
    );

    // initial animation state
    setTimeout(() => { ensureInitialOpenState(); }, 0);

    let lastScrollTime = 0;
    let lastProgress = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };
    let lastSection = 0;

    const onScroll = () => {
      const now = performance.now();
      const p = {
        1: progressFor(sectRefs[1].current),
        2: progressFor(sectRefs[2].current),
        3: progressFor(sectRefs[3].current),
        4: progressFor(sectRefs[4].current),
        5: progressFor(sectRefs[5].current),
        6: progressFor(sectRefs[6].current),
        7: progressFor(sectRefs[7].current),
        8: progressFor(sectRefs[8].current),
      };

      // determine current section
      let currentSection = 0;
      for (let i = 1; i <= 8; i++) {
        if (p[i] > 0 && p[i] <= 1) { currentSection = i; break; }
      }
      const anyActive = Object.values(p).some(v => v > 0);
      const isInTransition = currentSection === 0 && anyActive;

      if (currentSection !== lastSection) {
        window.dispatchEvent(new CustomEvent("sectionChange", { detail: { section: currentSection } }));
        if (lastSection > 0) SECTION_DEFS[lastSection - 1].onExit?.();
        if (currentSection > 0) {
          SECTION_DEFS[currentSection - 1].onEnter?.();
          [...triggeredTweensRef.current].forEach((key) => {
            if (key.startsWith(`${currentSection}:`)) triggeredTweensRef.current.delete(key);
          });
        }

        // section 7 flythrough
        if (currentSection === 7 && !section7RunnerRef.current.running) startFlythrough();
        if (lastSection === 7 && section7RunnerRef.current.running) stopFlythrough();

        // section 8 flythrough + animation
        if (currentSection === 8 && !section8RunnerRef.current.running) {
          startSection8Flythrough();
          startSection8Animation();
        }
        if (lastSection === 8 && section8RunnerRef.current.running) {
          stopSection8Flythrough();
          stopSection8Animation();
        }

        lastSection = currentSection;
      }

      // scroll speed for camera durations
      const deltaTime = now - lastScrollTime;
      const diffs = [1, 2, 3, 4, 5, 6, 7, 8].map(i => Math.abs(p[i] - lastProgress[i]));
      const maxDelta = Math.max(...diffs);
      const isFast = deltaTime > 0 && maxDelta / deltaTime > 0.001;

      // build animation scrubs/snaps for the active section
      let scrubs = [];
      if (currentSection > 0) {
        const def = SECTION_DEFS[currentSection - 1];
        def.onUpdate?.(p[currentSection]);

        for (const act of def.actions) {
          if (!act.clip) continue;
          if (act.mode === "scrub") {
            const t = THREE.MathUtils.clamp(act.map(p[currentSection] ?? 0), 0, 1);
            scrubs.push({ name: act.clip, t });
          } else if (act.mode === "snap") {
            const cond = act.when ? !!act.when(p[currentSection]) : true;
            if (cond) scrubs.push({ name: act.clip, t: THREE.MathUtils.clamp(act.t ?? 0, 0, 1) });
          }
        }

        // camera per section
        if (def.camera?.mode === "fixed") {
          const pose = def.camera.getPose(p[currentSection]);
          queueCam(pose, { baseDuration: def.camera.baseDuration?.(p[currentSection], isFast) ?? 2.0 });
        }
      }

      // Send scrubs: Section 6 must be NON-EXCLUSIVE to preserve Side's open state
      if (currentSection === 8) {
        // Section 8 animations are driven by its timer-runner
      } else if (scrubs.length) {
        const exclusive = currentSection !== 6; // <-- keep Side open in section 6, but all other sections (including 5) are exclusive
        animator.scrub(scrubs, exclusive);
      } else {
        window.dispatchEvent(new Event("clearScrub"));
      }

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
      stopSection8Flythrough();
      stopSection8Animation();
    };
  }, [api]); // rebind when clipNames/group change

  // passive tick
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
      {/* 1..8 */}
      <section ref={sectRefs[1]} className="min-h-[120vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>
      <section ref={sectRefs[2]} className="min-h-[120vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>
      <section ref={sectRefs[3]} className="min-h-[120vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>
      {/* Door open */}
      <section ref={sectRefs[4]} className="min-h-[120vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>
      {/* Side only */}
      <section ref={sectRefs[5]} className="min-h-[120vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>
      {/* BackWindow open, keep Side open */}
      <section ref={sectRefs[6]} className="min-h-[120vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>
      {/* Flythrough */}
      <section ref={sectRefs[7]} className="min-h-[350vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>
      {/* Return/Close */}
      <section ref={sectRefs[8]} className="min-h-[120vh] px-6 py-24 border-slate-800 relative z-20"><div /></section>

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

import React, { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { useGzipGLTF } from "../hooks/useGzipGLTF";
import { animationsBridge } from "../utils/animationsBridge";

/** SceneContent: loads the GLB and accepts "scrub" events to set clip time by scroll */
export function SceneContent({ onCenter, onLoadingComplete }) {
  const group = useRef();
  const { scene, animations, loading, error } = useGzipGLTF("/Tent3.glb.gz");
  const anims = useAnimations(animations || [], group);
  const { actions, mixer } = anims;

  useEffect(() => {
    if (!actions) return;
    Object.values(actions).forEach((action) => {
      if (!action) return;
      action.setLoop(THREE.LoopOnce);
      action.clampWhenFinished = true;
    });
  }, [actions]);

  useEffect(() => {
    if (!scene) return;
    scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }, [scene]);

  useEffect(() => {
    if (!group.current || !scene) return;

    const box = new THREE.Box3().setFromObject(group.current);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Center the object and rest it on ground
    group.current.position.sub(center);
    const worldBox = new THREE.Box3().setFromObject(group.current);
    const minY = worldBox.min.y;
    group.current.position.y -= minY;

    onCenter?.(new THREE.Vector3(0, 0, 0));

    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 10) {
      const scale = 10 / maxDim;
      group.current.scale.setScalar(scale);
    }
  }, [onCenter, scene]);

  useEffect(() => {
    if (actions && Object.keys(actions).length && animations && animations.length > 0) {
      console.log("Available animations:", Object.keys(actions));
      console.log("Animation clips:", animations.map((clip) => ({ name: clip.name, duration: clip.duration })));
      animationsBridge.publish({ actions, group });
    }
  }, [actions, animations]);

  useEffect(() => {
    if (!loading && scene && onLoadingComplete) onLoadingComplete();
  }, [loading, scene, onLoadingComplete]);

  // === SCRUB BUS ===
  const scrubRef = useRef({ entries: [], exclusive: true });
  const sectionRef = useRef(-1); // Track current section
  const animationStartedRef = useRef(false); // Track if animations have started in section 5
  const mattressAnimationStartedRef = useRef(false); // Track if mattress animation has started in section 3

  useEffect(() => {
    const onScrub = (e) => {
      const detail = e.detail || {};
      scrubRef.current = { entries: Array.isArray(detail.entries) ? detail.entries : [], exclusive: detail.exclusive !== false };
    };
    const onClear = () => {
      scrubRef.current = { entries: [], exclusive: true };
    };
    const onSectionChange = (e) => {
      const { section } = e.detail || {};
      const previousSection = sectionRef.current;
      sectionRef.current = section;

      // Reset animation flag when entering/leaving section 3
      if (section === 3 && previousSection !== 3) {
        mattressAnimationStartedRef.current = false;
        console.log("Entering section 3, resetting mattress animation flag");
      }
      if (previousSection === 3 && section !== 3) {
        mattressAnimationStartedRef.current = false;
        console.log("Leaving section 3, resetting mattress animation flag");
      }
      // Reset flags for section 5
      if (section === 5 && previousSection !== 5) {
        animationStartedRef.current = false;
        console.log("Entering section 5, resetting animation flags");
      }
      if (previousSection === 5 && section !== 5) {
        animationStartedRef.current = false;
        console.log("Leaving section 5, resetting animation flags");
      }
    };

    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("scrubClips", onScrub);
      window.addEventListener("clearScrub", onClear);
      window.addEventListener("sectionChange", onSectionChange);
      return () => {
        window.removeEventListener("scrubClips", onScrub);
        window.removeEventListener("clearScrub", onClear);
        window.removeEventListener("sectionChange", onSectionChange);
      };
    }
  }, []);

  useFrame((_, delta) => {
    if (!mixer || !actions) return;
    const currentSection = sectionRef.current;
    const entries = scrubRef.current.entries;

    // Section 3: Play mattress animation once
    if (currentSection === 3) {
      if (!mattressAnimationStartedRef.current) {
        console.log("Starting mattress animation once in section 3");
        // Find mattress animation
        const mattressActionName = Object.keys(actions).find((name) => {
          const lowerName = name.toLowerCase();
          return (
            lowerName.includes("mattress") ||
            lowerName.includes("matress") || // Common misspelling
            lowerName.includes("bed")
          );
        });
        if (mattressActionName && actions[mattressActionName]) {
          // Disable all other actions first
          Object.values(actions).forEach((a) => {
            if (!a) return;
            a.enabled = false;
            a.weight = 0;
            a.stop();
          });
          // Start mattress animation once
          const mattressAction = actions[mattressActionName];
          mattressAction.reset();
          mattressAction.enabled = true;
          mattressAction.weight = 1;
          mattressAction.paused = false;
          mattressAction.setLoop(THREE.LoopOnce);
          mattressAction.clampWhenFinished = true;
          mattressAction.play();
          console.log(`Started ${mattressActionName} animation once`);
        } else {
          console.log("Mattress animation not found. Available actions:", Object.keys(actions));
        }
        mattressAnimationStartedRef.current = true;
      }
      mixer.update(delta);
    }
    // Section 5: Play animations once
    else if (currentSection === 5) {
      if (!animationStartedRef.current) {
        console.log("Starting animations once in section 5");
        const sideAction = actions["Side"];
        const backWindowActionName = Object.keys(actions).find((name) => {
          const lowerName = name.toLowerCase();
          return (
            lowerName.includes("backwindow") ||
            lowerName.includes("back_window") ||
            lowerName.includes("back-window") ||
            lowerName === "backwindow" ||
            lowerName.includes("window")
          );
        });

        // Disable all other actions first
        Object.values(actions).forEach((a) => {
          if (!a) return;
          a.enabled = false;
          a.weight = 0;
          a.stop();
        });

        if (sideAction) {
          sideAction.reset();
          sideAction.enabled = true;
          sideAction.weight = 1;
          sideAction.paused = false;
          sideAction.setLoop(THREE.LoopOnce);
          sideAction.clampWhenFinished = true;
          sideAction.play();
          console.log("Started Side animation once");
        }
        if (backWindowActionName && actions[backWindowActionName]) {
          const backWindowAction = actions[backWindowActionName];
          backWindowAction.reset();
          backWindowAction.enabled = true;
          backWindowAction.weight = 1;
          backWindowAction.paused = false;
          backWindowAction.setLoop(THREE.LoopOnce);
          backWindowAction.clampWhenFinished = true;
          backWindowAction.play();
          console.log(`Started ${backWindowActionName} animation once`);
        }
        animationStartedRef.current = true;
      }
      mixer.update(delta);
    }
    // Normal scroll-controlled animation
    else if (entries.length > 0) {
      if (scrubRef.current.exclusive) {
        Object.values(actions).forEach((a) => {
          if (!a) return;
          a.enabled = false;
          a.weight = 0;
        });
      }
      entries.forEach(({ name, t }) => {
        const a = actions[name];
        if (!a) {
          console.log(`Action not found: ${name}`);
          return;
        }
        const clip = a.getClip();
        const tt = THREE.MathUtils.clamp(t, 0, 1);
        a.enabled = true;
        a.weight = 1;
        a.paused = true;
        a.play();
        a.time = tt * clip.duration;

        if (name.toLowerCase().includes("window") || name.toLowerCase().includes("backwindow")) {
          console.log(`${name} animation: t=${t}, time=${a.time}, duration=${clip.duration}`);
        }
      });
      mixer.update(0);
    } else {
      mixer.update(0);
    }
  });

  if (loading) return null;
  if (error) {
    console.error("Error loading GLB:", error);
    return null;
  }
  if (!scene) return null;

  return (
    <group ref={group}>
      <primitive object={scene} />
    </group>
  );
}

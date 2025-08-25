    import React, { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Environment, useAnimations, Text, Billboard } from "@react-three/drei";
import * as THREE from "three";
import { useGzipGLTF } from "./hooks/useGzipGLTF";

/**
 * Scroll-driven tent demo (door reversed + geo1 styling preserved)
 * + Per-section CAMERA POSES (position + target) with easing
 * + New FLYTHROUGH section
 * + **Preloaded Weight**: a single weight cube is CREATED at init far above the rack
 *   (once the model is ready) and reused for all drops — no new meshes, no scene reloads.
 *
 * Orbit: rotate/zoom disabled; pan allowed.
 */

/** ===== Camera Pose Config ===== */
const CAMERAS = {
  s1: { position: new THREE.Vector3(-3.2, 1.7, -3.6), target: new THREE.Vector3(0, 0.5, 0), duration: 2.0 },
  s2: { position: new THREE.Vector3(-1.7, 1.15, -1.05), target: new THREE.Vector3(0.7, 0.9, 0), duration: 1.5 },
  s3: { position: new THREE.Vector3(-1.7, 1.15, -1.05), target: new THREE.Vector3(0.7, 0.9, 0), duration: 1.5 }, // Same as s2 for mattress animation
  s4: { position: new THREE.Vector3(0, 1.5, -5), target: new THREE.Vector3(0, 0, 0), duration: 2.0 }, // Moved from s3 - "Side" animation scene from back
  s6: { position: new THREE.Vector3(-1.7, 1.15, -1.05), target: new THREE.Vector3(0.7, 0.9, 0), duration: 1.5 }, // Same as s2 for consistent viewing
  idle: { position: new THREE.Vector3(3, 1.6, 3.4), target: new THREE.Vector3(0, 0.5, 0), duration: 3.0 },
  fly: [
    // Start from far back and high
    { position: new THREE.Vector3(0, .8, -7), target: new THREE.Vector3(0, 0.5, 0), duration: 0 },
    // Move to the left side
    { position: new THREE.Vector3(0, .8, -1), target: new THREE.Vector3(0, 0.8, 0), duration: 1.0 },
  ],
};

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const rigRef = useRef({ camera: null, controls: null, defaultPos: null, defaultTarget: new THREE.Vector3(0, 0, 0) });

  const handleResetCamera = () => {
    window.dispatchEvent(
      new CustomEvent("setCameraPose", {
        detail: { position: CAMERAS.idle.position.toArray(), target: CAMERAS.idle.target.toArray(), immediate: true },
      })
    );
  };

  const handleCenter = (center) => {
    const rig = rigRef.current;
    rig.defaultTarget.copy(center);
    if (rig.controls) {
      rig.controls.target.copy(center);
      rig.controls.update();
    }
  };

  const handleLoadingComplete = () => setIsLoading(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Sticky Viewer Header */}
      <div className="sticky top-0 z-0 h-[100svh] border-b border-slate-800">
        <div className="absolute top-4 left-4 z-10 rounded-xl border border-slate-800/80 bg-black/40 px-3 py-2 text-sm font-semibold tracking-wide">
          tent1 • Scroll to Animate (Preloaded Weight at Init)
        </div>

        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
            <div className="text-center">
              <div className="text-slate-300 text-lg font-semibold mb-2">Loading 3D Model...</div>
              <div className="text-slate-500 text-sm">Decompressing gzipped GLB file</div>
            </div>
          </div>
        )}

        <Canvas shadows camera={{ fov: 45, near: 0.1, far: 200, position: CAMERAS.idle.position.toArray() }}>
          <Suspense fallback={null}>
            <Rig rigRef={rigRef} initialTarget={CAMERAS.idle.target} />
            <Environment preset="city" background={false} />
            <ambientLight intensity={0.3} />
            <directionalLight castShadow intensity={1.1} position={[5, 6, 3]} shadow-mapSize={[2048, 2048]} />
            <hemisphereLight intensity={0.2} groundColor="#444444" />
            <ContactShadows position={[0, -0.001, 0]} opacity={0.7} scale={20} blur={2.5} far={20} />

            <SceneContent onCenter={handleCenter} onLoadingComplete={handleLoadingComplete} />

            {/* Preloaded, single weight mesh (created once, drops on event) */}
            <WeightLayerPreloaded />
          </Suspense>
        </Canvas>

        <div className="absolute bottom-4 left-4 z-10 flex gap-2">
          <button onClick={handleResetCamera} className="rounded-xl px-3 py-2 border border-slate-700 bg-slate-800/60 text-sm">
            Reset Camera
          </button>
        </div>
      </div>

      {/* Static Feature Description Overlay */}
      <FeatureDescriptionOverlay />

      <ScrollSections />
    </div>
  );
}

function Rig({ rigRef, initialTarget = new THREE.Vector3(0, 0, 0) }) {
  const { camera } = useThree();
  const controls = useRef();

  // Animation state for time-based transitions
  const animationState = useRef({
    isAnimating: false,
    startTime: 0,
    duration: 2.0,
    startPos: new THREE.Vector3(),
    startTarget: new THREE.Vector3(),
    endPos: new THREE.Vector3(),
    endTarget: new THREE.Vector3(),
  });

  useEffect(() => {
    if (controls.current) {
      controls.current.target.copy(initialTarget);
      controls.current.update();
    }
  }, [initialTarget]);

  useEffect(() => {
    if (rigRef.current) {
      rigRef.current.camera = camera;
      rigRef.current.controls = controls.current;
      rigRef.current.defaultPos = camera.position.clone();
    }
  }, [camera, rigRef]);

  useEffect(() => {
    const onSetPose = (e) => {
      const { position, target, immediate, duration = 2.0 } = e.detail || {};
      if (!controls.current) return;
      const pos = Array.isArray(position) ? new THREE.Vector3().fromArray(position) : null;
      const tar = Array.isArray(target) ? new THREE.Vector3().fromArray(target) : null;
      if (!pos || !tar) return;

      if (immediate) {
        camera.position.copy(pos);
        controls.current.target.copy(tar);
        controls.current.update();
        animationState.current.isAnimating = false;
        return;
      }

      const st = animationState.current;
      st.startPos.copy(camera.position);
      st.startTarget.copy(controls.current.target);
      st.endPos.copy(pos);
      st.endTarget.copy(tar);
      st.duration = Math.max(0.1, duration);
      st.startTime = performance.now();
      st.isAnimating = true;
    };
    
    // Add defensive check for window object
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener("setCameraPose", onSetPose);
      return () => window.removeEventListener("setCameraPose", onSetPose);
    }
  }, [camera]);

  useFrame(() => {
    const st = animationState.current;
    if (!controls.current || !st.isAnimating) return;
    const elapsed = (performance.now() - st.startTime) / 1000;
    const p = Math.min(1, elapsed / st.duration);
    const e = 1 - Math.pow(1 - p, 3);
    camera.position.lerpVectors(st.startPos, st.endPos, e);
    controls.current.target.lerpVectors(st.startTarget, st.endTarget, e);
    controls.current.update();
    if (p >= 1) st.isAnimating = false;
  });

  return (
    <OrbitControls
      ref={controls}
      enableDamping
      dampingFactor={0.08}
      enableRotate={false}
      enableZoom={false}
      enableKeys={false}
      mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }}
      touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.PAN }}
    />
  );
}

/** SceneContent: loads the GLB and accepts "scrub" events to set clip time by scroll */
function SceneContent({ onCenter, onLoadingComplete }) {
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
      console.log('Available animations:', Object.keys(actions));
      console.log('Animation clips:', animations.map(clip => ({name: clip.name, duration: clip.duration})));
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
    const onClear = () => { scrubRef.current = { entries: [], exclusive: true }; };
    const onSectionChange = (e) => {
      const { section } = e.detail || {};
      const previousSection = sectionRef.current;
      sectionRef.current = section;
      
      // Reset animation flag when entering section 3
      if (section === 3 && previousSection !== 3) {
        mattressAnimationStartedRef.current = false;
        console.log('Entering section 3, resetting mattress animation flag');
      }
      
      // Reset animation flag when leaving section 3
      if (previousSection === 3 && section !== 3) {
        mattressAnimationStartedRef.current = false;
        console.log('Leaving section 3, resetting mattress animation flag');
      }
      
      // Reset animation flag when entering section 5
      if (section === 5 && previousSection !== 5) {
        animationStartedRef.current = false;
        console.log('Entering section 5, resetting animation flags');
      }
      
      // Reset animation flag when leaving section 5
      if (previousSection === 5 && section !== 5) {
        animationStartedRef.current = false;
        console.log('Leaving section 5, resetting animation flags');
      }
    };
    
    // Add defensive checks for window object
    if (typeof window !== 'undefined' && window.addEventListener) {
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
      // Only start animation once when entering section 3
      if (!mattressAnimationStartedRef.current) {
        console.log('Starting mattress animation once in section 3');
        
        // Find mattress animation
        const mattressActionName = Object.keys(actions).find(name => {
          const lowerName = name.toLowerCase();
          return lowerName.includes("mattress") || 
                 lowerName.includes("matress") || // Common misspelling
                 lowerName.includes("bed");
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
          console.log('Mattress animation not found. Available actions:', Object.keys(actions));
        }
        
        mattressAnimationStartedRef.current = true;
      }
      
      // Update mixer to continue playing the animation
      mixer.update(delta);
    }
    // Section 5: Play animations once
    else if (currentSection === 5) {
      // Only start animations once when entering section 5
      if (!animationStartedRef.current) {
        console.log('Starting animations once in section 5');
        
        // Find Side and BackWindow animations
        const sideAction = actions["Side"];
        const backWindowActionName = Object.keys(actions).find(name => {
          const lowerName = name.toLowerCase();
          return lowerName.includes("backwindow") || 
                 lowerName.includes("back_window") ||
                 lowerName.includes("back-window") ||
                 lowerName === "backwindow" ||
                 lowerName.includes("window");
        });
        
        // Disable all other actions first
        Object.values(actions).forEach((a) => { 
          if (!a) return; 
          a.enabled = false; 
          a.weight = 0; 
          a.stop();
        });
        
        // Start Side animation once
        if (sideAction) {
          sideAction.reset();
          sideAction.enabled = true;
          sideAction.weight = - 1;
          sideAction.paused = false;
          sideAction.setLoop(THREE.LoopOnce);
          sideAction.clampWhenFinished = true;
          sideAction.play();
          console.log(`Started Side animation once`);
        }
        
        // Start BackWindow animation once
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
      
      // Update mixer to continue playing the animations
      mixer.update(delta);
    }
    // Normal scroll-controlled animation
    else if (entries.length > 0) {
      if (scrubRef.current.exclusive) {
        Object.values(actions).forEach((a) => { if (!a) return; a.enabled = false; a.weight = 0; });
      }
      entries.forEach(({ name, t }) => {
        const a = actions[name];
        if (!a) {
          console.log(`Action not found: ${name}`);
          return;
        }
        const clip = a.getClip();
        const tt = THREE.MathUtils.clamp(t, 0, 1);
        a.enabled = true; a.weight = 1; a.paused = true; a.play(); a.time = tt * clip.duration;
        
        // Log when BackWindow or window-related animation is being animated
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
  if (error) { console.error("Error loading GLB:", error); return null; }
  if (!scene) return null;

  return (
    <group ref={group}>
      <primitive object={scene} />
    </group>
  );
}

/**
 * Preloaded single weight cube
 * - Initializes once when the GLTF group is available
 * - Starts far above the rack
 * - Listens for `triggerWeightDrop` to animate down (no new meshes created)
 * - Only visible during section 0
 */
function WeightLayerPreloaded() {
  const groupRef = useRef(null);
  const readyRef = useRef(false);
  const weightRef = useRef(null);
  const labelRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  // CONFIGURABLE: Final weight position offset (negative = deeper penetration)
  const WEIGHT_FINAL_POSITION_OFFSET = -9.2; // Change this value to adjust final position

  // Cached scene metrics and animation state
  const dataRef = useRef({
    x: 0, z: 0, topY: 0, maxDim: 1, size: 1,
    startY: 5, endY: 0,
    pounds: 1000,
    t: 0,
    dropping: false,
  });

  // Receive group once (from SceneContent)
  useEffect(() => {
    const unsub = animationsBridge.subscribe(({ group }) => {
      groupRef.current = group?.current ? group.current : null;
    });
    return unsub;
  }, []);

  // Listen for section visibility changes
  useEffect(() => {
    const onSectionChange = (e) => {
      const { section } = e.detail || {};
      console.log('Weight component received section change:', section, 'isVisible will be:', section === 0);
      setIsVisible(section === 0);
      
      // If leaving section 0, reset weight position and stop any dropping animation
      if (section !== 0) {
        const d = dataRef.current;
        d.dropping = false;
        d.t = 0;
        if (weightRef.current && readyRef.current) {
          weightRef.current.position.set(d.x, d.startY, d.z);
          weightRef.current.scale.set(1, 1, 1);
        }
        if (labelRef.current && readyRef.current) {
          labelRef.current.position.set(d.x, d.startY + d.size * 0.8, d.z);
        }
      }
    };
    
    // Add defensive check for window object
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener("sectionChange", onSectionChange);
      return () => window.removeEventListener("sectionChange", onSectionChange);
    }
  }, []);

  // One-time initialization once the GLTF is ready
  useFrame(() => {
    if (readyRef.current) return;
    const root = groupRef.current;
    if (!root) return;
    // Compute world box ONCE at init
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    const weightSize = maxDim * 0.25 / 3; // 1/3 the original size
    const x = (box.min.x + box.max.x) / 2;
    const z = (box.min.z + box.max.z) / 2;
    const topY = box.max.y;

    const startY = topY + weightSize * 6.0; // REALLY far above
    const endY = topY - weightSize * 0.3 + maxDim * 0.01 + WEIGHT_FINAL_POSITION_OFFSET; // Use configurable offset

    Object.assign(dataRef.current, { x, z, topY, maxDim, size: weightSize, startY, endY, t: 0, dropping: false });

    // Position preloaded weight at startY
    if (weightRef.current) {
      weightRef.current.position.set(x, startY, z);
      weightRef.current.scale.set(1, 1, 1);
    }
    if (labelRef.current) {
      labelRef.current.position.set(x, startY + weightSize * 0.8, z);
    }

    readyRef.current = true;
  });

  // Respond to drop requests WITHOUT creating new meshes
  useEffect(() => {
    const onDrop = (e) => {
      const d = dataRef.current;
      if (!readyRef.current) return;
      const pounds = e.detail?.pounds ?? 1000;
      const contactFactor = THREE.MathUtils.clamp(e.detail?.contactFactor ?? 0.15, 0, 1);
      const endOffset = e.detail?.endOffset ?? WEIGHT_FINAL_POSITION_OFFSET; // Use configurable default
      d.pounds = pounds;
      d.endY = d.topY + d.size * endOffset + d.maxDim * 0.01; // use endOffset for positioning
      d.t = 0;
      d.dropping = true;
      // reset position to start height
      if (weightRef.current) weightRef.current.position.set(d.x, d.startY, d.z);
      if (labelRef.current) labelRef.current.position.set(d.x, d.startY + d.size * 0.8, d.z);
    };
    
    // Add defensive check for window object
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener("triggerWeightDrop", onDrop);
      return () => window.removeEventListener("triggerWeightDrop", onDrop);
    }
  }, []);

  // Animate if active; otherwise keep it hovering at its last y
  useFrame((_, delta) => {
    if (!readyRef.current || !weightRef.current) return;
    const d = dataRef.current;
    if (d.dropping) {
      d.t = Math.min(1, d.t + delta * 0.8);
      const e = 1 - Math.pow(1 - d.t, 3);
      const y = d.startY + (d.endY - d.startY) * e;
      weightRef.current.position.set(d.x, y, d.z);
      const squash = d.t >= 0.98 ? (d.t - 0.98) * 5 : 0; // tiny squash at end
      weightRef.current.scale.set(1 + squash, 1 - squash, 1 + squash);
      if (labelRef.current) labelRef.current.position.set(d.x, y + d.size * 0.8, d.z);
      if (d.t >= 1) d.dropping = false;
    }
  });

  // Render once the GLTF is known; toggle visibility instead of unmounting.
  if (!readyRef.current && !groupRef.current) return null;
  const d = dataRef.current;
  return (
    <group visible={isVisible}>
      <mesh ref={weightRef} castShadow receiveShadow position={[d.x, d.startY, d.z]}>
        <boxGeometry args={[d.size, d.size, d.size]} />
        <meshStandardMaterial color="#666666" metalness={0.3} roughness={0.6} />
      </mesh>
      <Billboard ref={labelRef} position={[d.x, d.startY + d.size * 0.8, d.z]}>
        <Text fontSize={d.size * 0.22} color="white" outlineWidth={0.02} outlineColor="black" anchorX="center" anchorY="middle">
          {`${d.pounds.toLocaleString()} lb`}
        </Text>
      </Billboard>
    </group>
  );
}

/** Static Feature Description Overlay */
function FeatureDescriptionOverlay() {
  const [currentSection, setCurrentSection] = useState(-1);

  // Listen for section changes
  useEffect(() => {
    const onSectionChange = (e) => {
      const { section } = e.detail || {};
      setCurrentSection(section);
    };
    
    // Add defensive check for window object
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener("sectionChange", onSectionChange);
      return () => window.removeEventListener("sectionChange", onSectionChange);
    }
  }, []);

  const sectionFeatures = {
    0: {
      title: "Weight Drop Testing",
      subtitle: "Structural Integrity Analysis",
      description: "Experience our advanced weight testing system that demonstrates the tent's exceptional load-bearing capacity. This feature simulates real-world stress conditions to ensure maximum safety and durability in extreme weather conditions.",
      features: [
        "1500 lb impact resistance",
        "Real-time deformation analysis",
        "Structural stress distribution",
        "Safety margin verification"
      ]
    },
    1: {
      title: "Quick Setup System",
      subtitle: "Revolutionary Assembly Technology",
      description: "Our patented quick-setup mechanism allows for effortless tent assembly in under 5 minutes. The reverse-engineering process shown demonstrates the sophisticated internal framework that makes rapid deployment possible.",
      features: [
        "Tool-free assembly",
        "Color-coded components",
        "Self-locking joints",
        "Weather-resistant materials"
      ]
    },
    2: {
      title: "Smart Entry System",
      subtitle: "Multi-Access Door Technology",
      description: "Features dual-access entry points with integrated window systems for optimal ventilation and visibility. The transparent viewing panels provide 360-degree awareness while maintaining weather protection.",
      features: [
        "Dual-zippered entry",
        "Integrated window system",
        "Storm-resistant seals",
        "Silent operation mechanism"
      ]
    },
    3: {
      title: "Comfort Sleep System",
      subtitle: "Ergonomic Rest Technology",
      description: "Advanced sleeping surface with integrated support systems designed for maximum comfort in outdoor conditions. The mattress deployment system ensures optimal sleeping conditions regardless of terrain.",
      features: [
        "Self-inflating technology",
        "Temperature regulation",
        "Pressure point relief",
        "Compact storage design"
      ]
    },
    4: {
      title: "Ventilation Management",
      subtitle: "Airflow Optimization System",
      description: "Intelligent side ventilation panels that automatically adjust to environmental conditions. The dynamic airflow system prevents condensation while maintaining optimal internal temperature.",
      features: [
        "Automatic climate control",
        "Moisture management",
        "Silent air circulation",
        "Energy-efficient operation"
      ]
    },
    5: {
      title: "Structural Overview",
      subtitle: "Engineering Excellence",
      description: "Take a comprehensive tour through our tent's innovative engineering. This flythrough showcases the integration of all systems working in harmony to deliver unmatched outdoor performance.",
      features: [
        "Integrated system design",
        "Modular architecture",
        "Scalable configurations",
        "Field-tested reliability"
      ]
    },
    6: {
      title: "Future Innovations",
      subtitle: "Next-Generation Features",
      description: "Explore upcoming enhancements and technological advances that will define the future of outdoor shelter systems. Our research and development team continues to push the boundaries of what's possible.",
      features: [
        "Smart connectivity",
        "Solar integration",
        "Adaptive materials",
        "IoT compatibility"
      ]
    }
  };

  const currentFeature = sectionFeatures[currentSection];

  if (!currentFeature || currentSection === -1) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-20 max-w-sm bg-black/80 backdrop-blur-md border border-slate-700/50 rounded-xl p-6 text-slate-100">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-white">{currentFeature.title}</h3>
        <p className="text-sm text-blue-300 font-medium">{currentFeature.subtitle}</p>
      </div>
      
      <p className="text-sm text-slate-300 mb-4 leading-relaxed">
        {currentFeature.description}
      </p>
      
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-slate-200">Key Features:</h4>
        <ul className="space-y-1">
          {currentFeature.features.map((feature, index) => (
            <li key={index} className="text-xs text-slate-400 flex items-center">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mr-2 flex-shrink-0"></span>
              {feature}
            </li>
          ))}
        </ul>
      </div>
      
      <div className="mt-4 pt-3 border-t border-slate-700/50">
        <p className="text-xs text-slate-500">
          Section {currentSection + 1} of {Object.keys(sectionFeatures).length}
        </p>
      </div>
    </div>
  );
}

/** ===== Scroll Sections (DOM) → drive scrubbing + camera poses via events ===== */
function ScrollSections() {
  const api = useAnimationAPI();
  const sect0Ref = useRef(null);
  const sect1Ref = useRef(null);
  const sect2Ref = useRef(null);
  const sect3Ref = useRef(null);
  const sect4Ref = useRef(null);
  const sect5Ref = useRef(null);
  const sect6Ref = useRef(null);
  const doorNameRef = useRef(null);
  const appliedGeo1Ref = useRef(false);
  const weightDroppedRef = useRef(false);
  const tentCloseAnimRef = useRef({ started: false, completed: false, startTime: 0 });

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
            mat.color.setHex(0xffffff); // Reset to white/original color
            mat.needsUpdate = true;
          });
        } else {
          child.material.transparent = false;
          child.material.opacity = 1.0;
          child.material.color.setHex(0xffffff); // Reset to white/original color
          child.material.needsUpdate = true;
        }
      }
    });
    appliedGeo1Ref.current = false;
  };

  useEffect(() => {
    let lastScrollTime = 0;
    let lastS0 = 0, lastS1 = 0, lastS2 = 0, lastS3 = 0, lastS4 = 0, lastS5 = 0, lastS6 = 0;
    let lastSection = -1; // Track last section for section change events
    let lastActiveCamera = null; // Track last active camera to prevent idle jumps
    let tentHasBeenClosed = false; // Track if tent closing animation has been completed

    // Ensure tent starts fully open on initial load - animation0 must be complete
    const ensureInitialOpenState = () => {
      if (api.clipNames.length > 0) {
        const openEntries = [];
        if (api.clipNames.includes("animation0")) {
          openEntries.push({ name: "animation0", t: 1 }); // animation0 complete at start
        }
        if (api.clipNames.includes("TentOPENCLOSE")) {
          openEntries.push({ name: "TentOPENCLOSE", t: 1 }); // Fully open
        }
        if (openEntries.length > 0) {
          api.scrub(openEntries, true);
        }
      }
    };

    const onScroll = () => {
      const now = performance.now();
      const s0 = progressFor(sect0Ref.current);
      const s1 = progressFor(sect1Ref.current);
      const s2 = progressFor(sect2Ref.current);
      const s3 = progressFor(sect3Ref.current);
      const s4 = progressFor(sect4Ref.current);
      const s5 = progressFor(sect5Ref.current);
      const s6 = progressFor(sect6Ref.current);

      // Debug logging for section 4 (now the Side animation scene)
      if (s4 > 0) {
        console.log('Section 4 (Side animation) progress:', s4, 'sect4Ref.current:', sect4Ref.current);
      }
      
      // Debug logging for section 5 (now the flythrough)
      if (s5 > 0) {
        console.log('Section 5 (Flythrough) progress:', s5, 'sect5Ref.current:', sect5Ref.current);
      }

      const deltaTime = now - lastScrollTime;
      const maxDelta = Math.max(Math.abs(s0 - lastS0), Math.abs(s1 - lastS1), Math.abs(s2 - lastS2), Math.abs(s3 - lastS3), Math.abs(s4 - lastS4), Math.abs(s5 - lastS5), Math.abs(s6 - lastS6));
      const isFastScroll = deltaTime > 0 && maxDelta / deltaTime > 0.002;

      const entries = [];

      // --- FIX: Force BOTH animation0 and TentOPENCLOSE to t=1 immediately when entering Scene 0 ---
      if (s0 > 0 && lastS0 === 0) {
        const openAtScene0 = [];
        if (api.clipNames.includes("animation0")) openAtScene0.push({ name: "animation0", t: 1 });
        if (api.clipNames.includes("TentOPENCLOSE")) openAtScene0.push({ name: "TentOPENCLOSE", t: 1 });
        if (openAtScene0.length) api.scrub(openAtScene0, true);
      }

      // Dispatch section change events for weight visibility
      let currentSection = -1;
      if (s0 > 0 && s0 <= 1) currentSection = 0;
      else if (s1 > 0 && s1 <= 1) currentSection = 1;
      else if (s2 > 0 && s2 <= 1) currentSection = 2;
      else if (s3 > 0 && s3 <= 1) currentSection = 3;
      else if (s4 > 0 && s4 <= 1) currentSection = 4;
      else if (s5 > 0 && s5 <= 1) currentSection = 5;
      else if (s6 > 0 && s6 <= 1) currentSection = 6;
      
      // Check if we're between sections (in transition)
      const isInTransition = currentSection === -1 && (s0 > 0 || s1 > 0 || s2 > 0 || s3 > 0 || s4 > 0 || s5 > 0 || s6 > 0);
      
      // Only dispatch section change event if section actually changed
      if (currentSection !== lastSection) {
        console.log('Section changed from', lastSection, 'to', currentSection);
        window.dispatchEvent(new CustomEvent("sectionChange", { detail: { section: currentSection } }));
        lastSection = currentSection;
      }

      // Section 0: Weight Drop Demo
      if (s0 > 0 && s0 <= 1) {
        // Ensure tent is fully open when in section 0 - animation0 & TentOPENCLOSE must be 1
        const openEntries = [];
        if (api.clipNames.includes("animation0")) {
          openEntries.push({ name: "animation0", t: .91 });
        }
        if (api.clipNames.includes("TentOPENCLOSE")) {
          openEntries.push({ name: "TentOPENCLOSE", t: 1 });
        }
        // Force immediate application of complete state
        entries.push(...openEntries);
        
        // Reset geo1 material to original state in section 0
        resetGeo1Style();
        
        // Trigger weight drop once when entering this section
        if (s0 > 0.1 && !weightDroppedRef.current) {
          window.dispatchEvent(new CustomEvent("triggerWeightDrop", { 
            detail: { pounds: 1500 } // Uses WEIGHT_FINAL_POSITION_OFFSET variable
          }));
          weightDroppedRef.current = true;
        }
        setCameraPose(CAMERAS.idle, isFastScroll);
        lastActiveCamera = CAMERAS.idle;
      } else {
        // Reset weight drop flag when leaving section 0
        weightDroppedRef.current = false;
      }

      // Section 1: Open/Setup Tent (reversed)
      if (s1 > 0 && s1 <= 1) {
        const tRev = 1 - s1;
        
        // Reset geo1 material to original state in section 1
        resetGeo1Style();
        
        // animation0 should be at max time (1) at beginning, then decrease to 0
        if (api.clipNames.includes("animation0")) {
          entries.push({ name: "animation0", t: Math.max(0, tRev) });
        }
        if (api.clipNames.includes("TentOPENCLOSE")) {
          entries.push({ name: "TentOPENCLOSE", t: Math.max(0, tRev) });
        }
        
        // When we reach the end of section 1 (s1 = 1, tRev = 0), ensure tent is fully closed
        if (s1 >= 0.98) { // Near the end of the section
          tentHasBeenClosed = true;
          if (api.clipNames.includes("animation0")) {
            entries.push({ name: "animation0", t: 0 });
          }
          if (api.clipNames.includes("TentOPENCLOSE")) {
            entries.push({ name: "TentOPENCLOSE", t: 0 });
          }
        }
        
        setCameraPose(CAMERAS.s1, isFastScroll);
        lastActiveCamera = CAMERAS.s1;
      }

      // Section 2: Door (forward) + BackWindow
      const door = doorNameRef.current;
      if (s2 > 0 && s2 <= 1) {
        applyGeo1Style();
        
        // Always try to play door animation if found
        if (door) {
          entries.push({ name: door, t: s2 });
        }
        
        // Look for BackWindow animation (case insensitive and multiple variations)
        const backWindowAnim = api.clipNames.find(name => {
          const lowerName = name.toLowerCase();
          return lowerName.includes("backwindow") || 
                 lowerName.includes("back_window") ||
                 lowerName.includes("back-window") ||
                 lowerName === "backwindow" ||
                 lowerName.includes("window");
        });
        
        if (backWindowAnim) {
          console.log(`Found and playing ${backWindowAnim} animation at t: ${s2}`);
          entries.push({ name: backWindowAnim, t: s2 });
        } else {
          console.log(`BackWindow animation not found. Available clips:`, api.clipNames);
          console.log(`Available clips (lowercase):`, api.clipNames.map(n => n.toLowerCase()));
          
          // Try to play any animation that might be window-related
          const possibleWindowAnim = api.clipNames.find(name => 
            name.toLowerCase().includes("window") || 
            name.toLowerCase().includes("back")
          );
          if (possibleWindowAnim) {
            console.log(`Trying possible window animation: ${possibleWindowAnim}`);
            entries.push({ name: possibleWindowAnim, t: s2 });
          }
        }
        setCameraPose(CAMERAS.s2, isFastScroll);
        lastActiveCamera = CAMERAS.s2;
      }

      // Section 3: Mattress Animation (same camera as section 2)
      if (s3 > 0 && s3 <= 1) {
        // Apply same geo1 styling as section 2
        applyGeo1Style();
        
        // Only handle camera positioning, animation is handled in SceneContent (one-time play)
        console.log('Section 3 active, setting camera to CAMERAS.s3:', CAMERAS.s3);
        setCameraPose(CAMERAS.s3, isFastScroll);
        lastActiveCamera = CAMERAS.s3;
      }

      // Section 4: Side Animation (moved from section 3)
      if (s4 > 0 && s4 <= 1) {
        console.log('Side animation section active, s4:', s4);
        if (api.clipNames.includes("Side")) {
          entries.push({ name: "Side", t: s4 });
          console.log('Playing Side animation at t:', s4);
        }
        setCameraPose(CAMERAS.s4, isFastScroll);
        lastActiveCamera = CAMERAS.s4;
      }

      // Section 5: Flythrough camera path (moved from section 4)
      if (s5 > 0 && s5 <= 1) {
        console.log('Flythrough section active, s5:', s5);
        
        // Set camera pose for flythrough
        console.log('CAMERAS.fly:', CAMERAS.fly);
        const pose = interpolatePose(CAMERAS.fly, s5);
        console.log('Interpolated pose:', pose);
        if (pose) {
          console.log('Setting camera pose:', pose);
          setCameraPose(pose, isFastScroll);
          lastActiveCamera = pose;
        } else {
          console.log('No pose returned from interpolatePose');
        }
      }

      // Section 6: New scene with blank camera position (moved from section 5)
      if (s6 > 0 && s6 <= 1) {
        setCameraPose(CAMERAS.s6, isFastScroll);
        lastActiveCamera = CAMERAS.s6;
      }

      if (entries.length > 0) {
        api.scrub(entries, true);
      } else {
        // When no active animations, manage tent state based on current section
        if (s0 > 0) {
          // In section 0: keep tent fully open - animation0 & TentOPENCLOSE must be 1
          const openEntries = [];
          if (api.clipNames.includes("animation0")) {
            openEntries.push({ name: "animation0", t: 1 });
          }
          if (api.clipNames.includes("TentOPENCLOSE")) {
            openEntries.push({ name: "TentOPENCLOSE", t: 1 });
          }
          if (openEntries.length > 0) {
            api.scrub(openEntries, true);
          } else {
            window.dispatchEvent(new Event("clearScrub"));
          }
        } else if (tentHasBeenClosed && (s2 === 0 && s3 === 0 && s4 === 0 && s5 === 0 && s6 === 0)) {
          // Keep tent closed when in idle state after closing (but not in section 0)
          const closeEntries = [];
          if (api.clipNames.includes("animation0")) {
            closeEntries.push({ name: "animation0", t: 0 });
          }
          if (api.clipNames.includes("TentOPENCLOSE")) {
            closeEntries.push({ name: "TentOPENCLOSE", t: 0 });
          }
          if (closeEntries.length > 0) {
            api.scrub(closeEntries, true);
          } else {
            window.dispatchEvent(new Event("clearScrub"));
          }
        } else {
          window.dispatchEvent(new Event("clearScrub"));
        }
        
        // Only set idle camera if we're truly outside all sections (not in transition)
        const allSectionsInactive = s0 === 0 && s1 === 0 && s2 === 0 && s3 === 0 && s4 === 0 && s5 === 0 && s6 === 0;
        
        if (allSectionsInactive && !isInTransition) {
          console.log('Setting idle camera. All sections inactive and not in transition');
          setCameraPose(CAMERAS.idle, isFastScroll);
          lastActiveCamera = CAMERAS.idle;
        } else if (isInTransition && lastActiveCamera) {
          // During transition, maintain the last active camera to prevent jumping to idle
          console.log('In transition, maintaining last active camera');
          // Don't set camera during transition to prevent jumping
        }
        
        // Reset geo1 style when not in any active section that needs it
        if (s2 === 0 && s3 === 0) {
          resetGeo1Style();
        }
      }

      lastScrollTime = now; lastS0 = s0; lastS1 = s1; lastS2 = s2; lastS3 = s3; lastS4 = s4; lastS5 = s5; lastS6 = s6;
      
      // Update tent closed state based on section 1 progress
      if (s1 >= 0.98) {
        tentHasBeenClosed = true;
      }
    };

    let scrollTimeout;
    const throttledScroll = () => {
      if (scrollTimeout) return;
      scrollTimeout = setTimeout(() => {
        onScroll();
        scrollTimeout = null;
      }, 16);
    };

    const onResize = () => onScroll();
    
    // Add defensive checks for window object
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener("scroll", throttledScroll, { passive: true });
      window.addEventListener("resize", onResize);
      setCameraPose(CAMERAS.idle, true);
      
      // Ensure tent starts fully open
      ensureInitialOpenState();
      
      onScroll();
      return () => {
        window.removeEventListener("scroll", throttledScroll);
        window.removeEventListener("resize", onResize);
        if (scrollTimeout) clearTimeout(scrollTimeout);
      };
    }
  }, [api]);

  // --- FIX (robustness): if clips arrive late AND we're already in Scene 0, force both to 1 ---
  useEffect(() => {
    if (api.clipNames.length === 0) return;
    const s0 = progressFor(sect0Ref.current);
    if (s0 > 0) {
      const openEntries = [];
      if (api.clipNames.includes("animation0")) openEntries.push({ name: "animation0", t: 1 });
      if (api.clipNames.includes("TentOPENCLOSE")) openEntries.push({ name: "TentOPENCLOSE", t: 1 });
      if (openEntries.length) api.scrub(openEntries, true);
    }
  }, [api.clipNames]);

  return (
    <main className="relative z-10">
      {/* Massive background div replacing all section overlays */}
      <div className="absolute inset-0 w-full h-full  pointer-events-none"></div>
      
      <section className="px-6 py-16 max-w-3xl mx-auto relative z-20">
        {/* <h1 className="text-3xl font-bold">Scroll to Animate the Tent</h1> */}
        {/* <p className="text-slate-400 mt-3">Weight is preloaded far above the rack on init and reused for every drop — no flashing, no reloads.</p> */}
      </section>

      {/* Section 0: Weight Drop Demo */}
      <section ref={sect0Ref} className="min-h-[120vh] px-6 py-24  border-slate-800 relative z-20">
        <div></div>
      </section>

      {/* Section 1: Open/Setup */}
      <section ref={sect1Ref} className="min-h-[120vh] px-6 py-24  border-slate-800 relative z-20">
        <div></div>
      </section>

      {/* Section 2: Door */}
      <section ref={sect2Ref} className="min-h-[120vh] px-6 py-24  border-slate-800 relative z-20">
        <div></div>
      </section>

      {/* Section 3: Mattress Animation */}
      <section ref={sect3Ref} className="min-h-[120vh] px-6 py-24  border-slate-800 relative z-20">
        <div></div>
      </section>

      {/* Section 4: Side Animation */}
      <section ref={sect4Ref} className="min-h-[120vh] px-6 py-24  border-slate-800 relative z-20">
        <div></div>
      </section>

      {/* Section 5: Flythrough */}
      <section ref={sect5Ref} className="min-h-[160vh] px-6 py-24  border-slate-800 relative z-20">
        <div></div>
      </section>

      {/* Section 6: New Scene */}
      <section ref={sect6Ref} className="min-h-[120vh] px-6 py-24  border-slate-800 relative z-20">
        <div></div>
      </section>

      <section className="px-6 py-24  border-slate-800 relative z-20">
        <div></div>
      </section>
    </main>
  );
}

function setCameraPose({ position, target, duration }, immediate = false) {
  const pos = position instanceof THREE.Vector3 ? position.toArray() : position;
  const tar = target instanceof THREE.Vector3 ? target.toArray() : target;
  window.dispatchEvent(new CustomEvent("setCameraPose", { detail: { position: pos, target: tar, duration: duration || 2.0, immediate } }));
}

/** Interpolate between an array of poses with smooth easing */
function interpolatePose(poses, t) {
  if (!poses || poses.length === 0) return null;
  if (poses.length === 1) return poses[0];
  const n = poses.length;
  const scaled = THREE.MathUtils.clamp(t, 0, 1) * (n - 1);
  const i = Math.max(0, Math.min(n - 2, Math.floor(scaled)));
  const lt = scaled - i;
  
  // Apply smooth easing to the interpolation
  const easedT = 1 - Math.pow(1 - lt, 3); // Ease out cubic
  
  const A = poses[i];
  const B = poses[i + 1];
  const pos = new THREE.Vector3().copy(A.position).lerp(B.position, easedT);
  const tar = new THREE.Vector3().copy(A.target).lerp(B.target, easedT);
  const dur = A.duration + (B.duration - A.duration) * easedT;
  return { position: pos, target: tar, duration: dur };
}

/** Utility: normalized progress 0..1 across a section’s scroll span (returns 0 when offscreen) */
function progressFor(el) {
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  // If the section is completely out of view, treat it as inactive.
  if (rect.bottom <= 0 || rect.top >= vh) return 0;
  const h = rect.height || 1;
  const p = (-rect.top) / h;
  return Math.max(0, Math.min(1, p));
}

/** ===== Animation API (pub/sub + helpers) ===== */
const animationState = { actions: {}, subscribers: new Set() };
function useAnimationAPI() {
  const [clipNames, setClipNames] = useState([]);
  const [group, setGroup] = useState(null);
  useEffect(() => {
    const cleanup = animationsBridge.subscribe(({ actions, group: sceneGroup }) => {
      animationState.actions = actions;
      setClipNames(Object.keys(actions || {}));
      setGroup(sceneGroup);
    });
    return cleanup;
  }, []);
  return {
    clipNames,
    group: group || null,
    scrub: (entries, exclusive = true) => {
      window.dispatchEvent(new CustomEvent("scrubClips", { detail: { entries, exclusive } }));
    },
  };
}

const animationsBridge = (() => {
  let listeners = new Set();
  return {
    publish(payload) { for (const fn of listeners) fn(payload); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();

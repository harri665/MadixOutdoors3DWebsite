import React, { Suspense, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment } from "@react-three/drei";
import { CameraRig } from "./components/CameraRig";
import { SceneContent } from "./components/SceneContent";
import { AnnotationSystem } from "./components/AnnotationSystem";
import { AnnotationOverlays } from "./components/AnnotationOverlays";
import { ScrollSections } from "./components/ScrollSections";
import { CAMERAS } from "./components/constants";
import * as THREE from "three";

/**
 * Scroll-driven tent demo with section-based camera poses and animations
 * + Per-section CAMERA POSES (position + target) with easing
 * + FLYTHROUGH section with smooth camera interpolation
 *
 * Orbit: rotate/zoom disabled; pan allowed.
 */

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const rigRef = useRef({ camera: null, controls: null, defaultPos: null, defaultTarget: new THREE.Vector3(0, 0, 0) });

  const handleResetCamera = () => {
    window.dispatchEvent(
      new CustomEvent("setCameraPose", {
        detail: {
          position: CAMERAS.idle.position.toArray(),
          target: CAMERAS.idle.target.toArray(),
          immediate: true,
        },
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
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black text-slate-100">
      {/* Sticky Viewer Header */}
      <div className="sticky top-0 z-0 h-[100svh] border-b border-slate-800">
        <div className="absolute top-4 left-4 z-10 rounded-xl border border-slate-800/80 bg-black/40 px-3 py-2 text-sm font-semibold tracking-wide">
          tent1 • Scroll to Animate
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
            <CameraRig rigRef={rigRef} initialTarget={CAMERAS.idle.target} />
            <Environment preset="city" background={false} />
            <ambientLight intensity={0.3} />
            <directionalLight castShadow intensity={1.1} position={[5, 6, 3]} shadow-mapSize={[2048, 2048]} />
            <hemisphereLight intensity={0.2} groundColor="#444444" />
            <ContactShadows position={[0, -0.001, 0]} opacity={0.7} scale={20} blur={2.5} far={20} />
            <SceneContent onCenter={handleCenter} onLoadingComplete={handleLoadingComplete} />
            {/* 3D Annotations System */}
            <AnnotationSystem />
          </Suspense>
        </Canvas>

        <div className="absolute bottom-4 left-4 z-10 flex gap-2">
          <button onClick={handleResetCamera} className="rounded-xl px-3 py-2 border border-slate-700 bg-slate-800/60 text-sm">
            Reset Camera
          </button>
        </div>
      </div>

      {/* 2D Annotation Overlays */}
      <AnnotationOverlays />
      <ScrollSections />
    </div>
  );
}

import React, { useRef, useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { CAMERA_SMOOTH_DEFAULT } from "./constants";

/**
 * Rig: now uses spring-like exponential smoothing for camera position and target.
 * - Every `setCameraPose` just updates desired pose; the rig eases toward it over time.
 * - `duration` on the event maps to a smoothing time-constant (≈time to reach ~95%).
 */
export function CameraRig({ rigRef, initialTarget = new THREE.Vector3(0, 0, 0) }) {
  const { camera } = useThree();
  const controls = useRef();

  const state = useRef({
    desiredPos: new THREE.Vector3(),
    desiredTarget: initialTarget.clone(),
    tau: CAMERA_SMOOTH_DEFAULT, // time-constant (seconds)
  });

  useEffect(() => {
    // Initialize desired to the camera's starting pose
    state.current.desiredPos.copy(camera.position);
    state.current.desiredTarget.copy(initialTarget);
    if (controls.current) {
      controls.current.target.copy(initialTarget);
      controls.current.update();
    }
  }, [camera, initialTarget]);

  useEffect(() => {
    if (rigRef.current) {
      rigRef.current.camera = camera;
      rigRef.current.controls = controls.current;
      rigRef.current.defaultPos = camera.position.clone();
    }
  }, [camera, rigRef]);

  useEffect(() => {
    const onSetPose = (e) => {
      const { position, target, immediate, duration = 3.0 } = e.detail || {};
      if (!controls.current) return;

      const pos = Array.isArray(position) ? new THREE.Vector3().fromArray(position) : null;
      const tar = Array.isArray(target) ? new THREE.Vector3().fromArray(target) : null;
      if (!pos || !tar) return;

      if (immediate) {
        camera.position.copy(pos);
        controls.current.target.copy(tar);
        controls.current.update();
        state.current.desiredPos.copy(pos);
        state.current.desiredTarget.copy(tar);
        return;
      }

      // Map provided duration → smoothing time constant for slower, smoother transitions
      // Using a gentler curve: tau = duration / 2.5 for slower approach to target
      state.current.tau = Math.max(0.2, duration / 2.5);
      state.current.desiredPos.copy(pos);
      state.current.desiredTarget.copy(tar);
    };

    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("setCameraPose", onSetPose);
      return () => window.removeEventListener("setCameraPose", onSetPose);
    }
  }, [camera]);

  useFrame((_, dt) => {
    if (!controls.current) return;
    
    // Enhanced delta time clamping to prevent jumps and ensure smooth transitions
    const clampedDt = Math.min(0.033, Math.max(0.001, dt)); // Cap at ~30fps, min 1ms
    const tau = state.current.tau || CAMERA_SMOOTH_DEFAULT;
    
    // Use a smoother exponential decay with adaptive damping
    const baseFactor = 1 - Math.exp(-clampedDt / tau);
    
    // Apply adaptive smoothing based on distance to target
    const distanceToTarget = camera.position.distanceTo(state.current.desiredPos);
    const targetDistance = controls.current.target.distanceTo(state.current.desiredTarget);
    const maxDistance = Math.max(distanceToTarget, targetDistance);
    
    // Slow down when very close to target for ultra-smooth final approach
    const adaptiveFactor = maxDistance > 0.1 ? baseFactor : baseFactor * 0.5;
    const smoothingFactor = Math.min(adaptiveFactor, 0.15); // Cap max speed for smoothness

    camera.position.lerp(state.current.desiredPos, smoothingFactor);
    controls.current.target.lerp(state.current.desiredTarget, smoothingFactor);
    controls.current.update();
  });

  return (
    <OrbitControls
      ref={controls}
      enableDamping
      dampingFactor={0.05}
      enableRotate={false}
      enableZoom={false}
      enableKeys={false}
      mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }}
      touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.PAN }}
      panSpeed={0.8}
      screenSpacePanning={true}
    />
  );
}

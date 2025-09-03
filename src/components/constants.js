import * as THREE from "three";

/** ===== Camera Pose Config ===== */
export const CAMERAS = {
  s1: { position: new THREE.Vector3(-3.2, 1.7, -3.6), target: new THREE.Vector3(0, 0.5, 0), duration: 3.5 },
  s2: { position: new THREE.Vector3(1.7, 1.15, 1.05), target: new THREE.Vector3(0.7, 0.9, 0), duration: 3.0 },
  s3: { position: new THREE.Vector3(1.7, 1.15, 1.05), target: new THREE.Vector3(0.7, 0.9, 0), duration: 3.0 }, // Same as s2 for mattress animation
  s4: { position: new THREE.Vector3(0, 1.5, -5), target: new THREE.Vector3(0, 0, 0), duration: 3.5 }, // Moved from s3 - "Side" animation scene from back
  s6: { position: new THREE.Vector3(-1.7, 1.15, -1.05), target: new THREE.Vector3(0.7, 0.9, 0), duration: 3.0 }, // Same as s2 for consistent viewing
  idle: { position: new THREE.Vector3(3, 1.6, 3.4), target: new THREE.Vector3(0, 0.5, 0), duration: 4.0 },
  fly: [
    // Start from far back and high
    { position: new THREE.Vector3(0, 0.8, -7), target: new THREE.Vector3(0, 0.5, 0), duration: 2.0 },
    // Move to the left side
    { position: new THREE.Vector3(0, 0.8, -1), target: new THREE.Vector3(0, 0.8, 0), duration: 2.5 },
  ],
};

// Default smoothing time constant (seconds). Larger = smoother transitions, smaller = snappier.
export const CAMERA_SMOOTH_DEFAULT = 1.2;

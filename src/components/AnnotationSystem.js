import React, { useRef, useEffect, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { animationsBridge } from "../utils/animationsBridge";

/**
 * 3D Annotation System - tracks 3D object positions and publishes to 2D overlay
 */
export function AnnotationSystem() {
  const groupRef = useRef(null);
  const { camera } = useThree();
  const [annotations, setAnnotations] = useState([]);

  // Define annotation targets for each section
  // Note: position property only affects mobile devices (<=768px width)
  // On desktop, all annotations are positioned from top regardless of position setting
  const annotationTargets = {
    1: [{ objectName: "Plane009", text: "Hard Shell Pop-Up Canopy", description: "* Solid ⅛\" formed aluminum sheet roof \n* Quick pop-up with trigger pull \n* Internal secure latch system (no exterior latches) \n* 96\" sleeping area, 101\" overall length ", position: "bottom" }],
    2: [{ objectName: "Point", text: "Four Season Tent", description: "* 3 zippered windows & doors (2 side, 1 rear) \n* Removable tent fabric \n* Interior LED lighting \n* Suede padded headliner with 1\" foam insulation in ceiling.", position: "bottom" }],
    3: [{ objectName: "Plane005", text: "Mattress", description: " * 2\" foam mattress with cover \n * Anti-condensation mat", position: "bottom" }],
    4: [{ objectName: "Plane008", text: "Pass-Through Access", description: "* Tilt-up bed panels for full truck bed use\n * Full standing room inside", position: "bottom" }],
    5: [{ objectName: "Plane015", text: "Side Hatches", description: "* Compression lock system \n * 3.5\" expanded sides for storage of gear & accessories on optional MOLLE panel system (no loss of interior space)", position: "bottom" }],
    6: [{ 
      objectName: "Plane003", 
      text: "Rear Hatch", 
      description: "* Compression lock system \n * Tinted rear acrylic window",
      position: "bottom"
    }],
    7: [{ 
      objectName: "Plane008", 
      text: "Interior Space", 
      description: "* Light Grey suede roof finish  \n *Interior LED light strip",
      position: "top"
    }]
  };

  // Subscribe to scene group updates
  useEffect(() => {
    const unsub = animationsBridge.subscribe(({ group }) => {
      groupRef.current = group?.current ? group.current : null;
    });
    return unsub;
  }, []);

  // Listen for section changes to update annotations
  useEffect(() => {
    const onSectionChange = (e) => {
      const { section } = e.detail || {};
      const targets = annotationTargets[section] || [];
      
      if (targets.length > 0 && groupRef.current) {
        const newAnnotations = targets.map((target, index) => {
          // Find the target object in the scene
          let targetObject = null;
          groupRef.current.traverse((child) => {
            if (child.name === target.objectName) {
              targetObject = child;
            }
          });

          if (targetObject) {
            // Get world position of the target object
            const worldPos = new THREE.Vector3();
            targetObject.getWorldPosition(worldPos);
            
            return {
              id: `${section}-${index}`,
              worldPosition: worldPos,
              text: target.text,
              description: target.description,
              objectName: target.objectName,
              position: target.position
            };
          }
          return null;
        }).filter(Boolean);

        setAnnotations(newAnnotations);
      } else {
        setAnnotations([]);
      }
    };

    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("sectionChange", onSectionChange);
      return () => window.removeEventListener("sectionChange", onSectionChange);
    }
  }, []);

  // Update 2D positions every frame
  useFrame(() => {
    if (annotations.length > 0 && camera) {
      const updatedAnnotations = annotations.map(annotation => {
        // Project 3D world position to 2D screen coordinates
        const screenPos = annotation.worldPosition.clone().project(camera);
        
        // Convert to pixel coordinates
        const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
        const y = (screenPos.y * -0.5 + 0.5) * window.innerHeight;
        const z = screenPos.z;
        
        return {
          ...annotation,
          screenPosition: { x, y, z },
          visible: z < 1 && z > -1 // Only show if not behind camera
        };
      });

      // Publish screen positions to 2D overlay
      window.dispatchEvent(new CustomEvent("updateAnnotations", { 
        detail: { annotations: updatedAnnotations } 
      }));
    }
  });

  return null;
}

import React, { Suspense, useRef, useState, useEffect } from "react";
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
  const [isMobile, setIsMobile] = useState(false);
  const rigRef = useRef({ camera: null, controls: null, defaultPos: null, defaultTarget: new THREE.Vector3(0, 0, 0) });

  // Mobile detection and viewport handling
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
      setIsMobile(isMobileDevice);
    };

    // Set initial mobile state
    checkMobile();

    // Handle resize events
    const handleResize = () => {
      checkMobile();
      // Fix mobile viewport height issues
      if (window.innerWidth <= 768) {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
      }
    };

    // Handle orientation change on mobile
    const handleOrientationChange = () => {
      setTimeout(() => {
        handleResize();
        // Force scroll recalculation after orientation change
        window.dispatchEvent(new Event('resize'));
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    // Initial setup
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  // Prevent zoom on mobile when double-tapping UI elements
  useEffect(() => {
    if (isMobile) {
      // Less aggressive touch prevention - only prevent multi-touch zoom
      const preventMultiTouchZoom = (e) => {
        if (e.touches && e.touches.length > 1) {
          e.preventDefault();
        }
      };

      // Only prevent double-tap zoom on specific elements, not globally
      const preventDoubleTapZoom = (e) => {
        const target = e.target;
        // Only prevent zoom on Canvas and UI elements, not scroll areas
        if (target.tagName === 'CANVAS' || target.closest('button')) {
          let lastTouchEnd = 0;
          const time = new Date().getTime();
          if (time - lastTouchEnd <= 300) {
            e.preventDefault();
          }
          lastTouchEnd = time;
        }
      };

      // Add listeners only to specific elements
      const canvas = document.querySelector('canvas');
      if (canvas) {
        canvas.addEventListener('touchstart', preventMultiTouchZoom, { passive: false });
        canvas.addEventListener('touchend', preventDoubleTapZoom, { passive: false });
        
        return () => {
          canvas.removeEventListener('touchstart', preventMultiTouchZoom);
          canvas.removeEventListener('touchend', preventDoubleTapZoom);
        };
      }
    }
  }, [isMobile]);

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
    <div className={`min-h-screen bg-gradient-to-br from-black via-gray-900 to-black text-slate-100 ${isMobile ? 'mobile-optimized' : ''}`} 
         style={isMobile ? { 
           minHeight: '100vh',
           height: 'auto',
           touchAction: 'pan-y' // Allow vertical scrolling on the main container
         } : {}}>
      {/* Sticky Viewer Header */}
      <div className={`sticky top-0 z-0 border-b border-slate-800 ${isMobile ? 'h-[100vh] touch-pan-y' : 'h-[100svh]'}`} 
           style={isMobile ? { 
             touchAction: 'none', // Only for the 3D viewport
             position: 'sticky',
             top: 0
           } : {}}>
        <div className={`absolute z-10 rounded-xl border border-slate-800/80 bg-black/40 px-3 py-2 text-sm font-semibold tracking-wide pointer-events-auto ${isMobile ? 'top-2 left-2 text-xs' : 'top-4 left-4'}`}>
          tent1 • {isMobile ? 'Swipe to Animate' : 'Scroll to Animate'}
        </div>

        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 backdrop-blur-sm">
            <div className="text-center space-y-6 p-8">
              {/* Logo/Brand Area */}
              <div className="relative">
                <div className="w-16 h-16 mx-auto mb-4 relative">
                  {/* Simple animated ring */}
                  <div className="absolute inset-0 border-2 border-slate-800 rounded-full"></div>
                  <div className="absolute inset-0 border-2 border-white rounded-full border-t-transparent animate-spin"></div>
                </div>
                
                {/* Simple white text */}
                <h1 className="text-2xl font-bold text-white mb-2">
                  Madix Outdoors
                </h1>
                <p className="text-slate-400 text-sm font-medium tracking-wide">
                  Interactive 3D Experience
                </p>
              </div>

              {/* Progress Section */}
              <div className="space-y-3 max-w-sm mx-auto">
                {/* Loading text */}
                <div className="text-slate-300 text-lg font-semibold">
                  <span className="inline-block">Loading 3D Model</span>
                  <span className="inline-block animate-pulse ml-1">.</span>
                  <span className="inline-block animate-pulse ml-0.5" style={{animationDelay: '0.2s'}}>.</span>
                  <span className="inline-block animate-pulse ml-0.5" style={{animationDelay: '0.4s'}}>.</span>
                </div>
                
                {/* Simple progress bar */}
                <div className="relative w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div className="absolute inset-0 bg-white rounded-full animate-[loading_2s_ease-in-out_infinite] opacity-80"></div>
                </div>
                
              </div>

              {/* Floating dots effect - simple white/gray theme */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-white rounded-full animate-float opacity-30"></div>
                <div className="absolute top-1/3 right-1/3 w-1 h-1 bg-slate-400 rounded-full animate-float-delayed opacity-20"></div>
                <div className="absolute bottom-1/3 left-1/3 w-1.5 h-1.5 bg-white rounded-full animate-float-slow opacity-25"></div>
                <div className="absolute bottom-1/4 right-1/4 w-1 h-1 bg-slate-300 rounded-full animate-float opacity-15"></div>
                <div className="absolute top-1/2 left-1/6 w-1 h-1 bg-white rounded-full animate-float-delayed opacity-20"></div>
                <div className="absolute top-3/4 right-1/6 w-1.5 h-1.5 bg-slate-400 rounded-full animate-float-slow opacity-25"></div>
              </div>
            </div>
          </div>
        )}

        <Canvas 
          shadows 
          camera={{ fov: isMobile ? 50 : 45, near: 0.1, far: 200, position: CAMERAS.idle.position.toArray() }}
          gl={{ 
            antialias: !isMobile, // Disable antialiasing on mobile for better performance
            powerPreference: isMobile ? "low-power" : "high-performance",
            alpha: false
          }}
          dpr={isMobile ? Math.min(window.devicePixelRatio, 2) : window.devicePixelRatio} // Limit DPR on mobile
        >
          <Suspense fallback={null}>
            <CameraRig rigRef={rigRef} initialTarget={CAMERAS.idle.target} />
            <Environment preset="city" background={false} />
            <ambientLight intensity={0.3} />
            <directionalLight castShadow intensity={1.1} position={[5, 6, 3]} shadow-mapSize={isMobile ? [1024, 1024] : [2048, 2048]} />
            <hemisphereLight intensity={0.2} groundColor="#444444" />
            <ContactShadows position={[0, -0.001, 0]} opacity={0.7} scale={20} blur={2.5} far={20} />
            <SceneContent onCenter={handleCenter} onLoadingComplete={handleLoadingComplete} />
            {/* 3D Annotations System */}
            <AnnotationSystem />
          </Suspense>
        </Canvas>

        <div className={`absolute z-10 flex gap-2 ${isMobile ? 'bottom-2 left-2' : 'bottom-4 left-4'}`}>
          <button 
            onClick={handleResetCamera} 
            className={`rounded-xl border border-slate-700 bg-slate-800/60 ${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'} touch-manipulation`}
          >
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

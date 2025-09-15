import React, { useState, useEffect } from "react";

/**
 * 2D Annotation Overlays - renders arrows and text based on 3D positions
 */
export function AnnotationOverlays() {
  const [annotations, setAnnotations] = useState([]);

  useEffect(() => {
    const onUpdateAnnotations = (e) => {
      const { annotations: newAnnotations } = e.detail || {};
      setAnnotations(newAnnotations || []);
    };

    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("updateAnnotations", onUpdateAnnotations);
      return () => window.removeEventListener("updateAnnotations", onUpdateAnnotations);
    }
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-15">
      {annotations.map((annotation, index) => {
        if (!annotation.visible || !annotation.screenPosition) return null;

        const { x, y } = annotation.screenPosition;
        
        // Ensure coordinates are within screen bounds
        const clampedX = Math.max(10, Math.min(window.innerWidth - 10, x));
        const clampedY = Math.max(10, Math.min(window.innerHeight - 10, y));
        
        // Position text blocks on the left or right side of the screen
        const isLeftSide = clampedX < window.innerWidth / 2;
        const textBlockX = isLeftSide ? 20 : window.innerWidth - 320; // 20px from edge, 300px width + 20px margin
        const textBlockY = 100 + (index * 160); // Stack text blocks vertically with spacing
        
        // Calculate line coordinates more precisely
        const lineStartX = isLeftSide ? textBlockX + 300 : textBlockX; // Start from edge of text block
        const lineStartY = textBlockY + 60; // Middle of text block height
        const lineEndX = clampedX;
        const lineEndY = clampedY;

        return (
          <div key={annotation.id} className="absolute inset-0">
            {/* Connection line - ensure it spans the full container */}
            <svg 
              className="absolute inset-0 w-full h-full"
              style={{ 
                pointerEvents: 'none',
                width: '100vw',
                height: '100vh',
                position: 'fixed',
                top: 0,
                left: 0,
                zIndex: 10
              }}
            >
              <defs>
                <marker
                  id={`arrowhead-${annotation.id}`}
                  markerWidth="8"
                  markerHeight="6"
                  refX="7"
                  refY="3"
                  orient="auto"
                >
                  <polygon
                    points="0 0, 8 3, 0 6"
                    fill="#ffffff"
                    stroke="#000000"
                    strokeWidth="0.5"
                  />
                </marker>
              </defs>
              <line
                x1={lineStartX}
                y1={lineStartY}
                x2={lineEndX}
                y2={lineEndY}
                stroke="#ffffff"
                strokeWidth="2"
                strokeDasharray="5,5"
                markerEnd={`url(#arrowhead-${annotation.id})`}
                opacity="0.9"
              />
              
              {/* Debug: Add circles at line endpoints to verify positioning */}
              <circle
                cx={lineStartX}
                cy={lineStartY}
                r="3"
                fill="#00ff00"
                opacity="0.7"
              />
              <circle
                cx={lineEndX}
                cy={lineEndY}
                r="3"
                fill="#ff0000"
                opacity="0.7"
              />
            </svg>

            {/* Text block positioned on side */}
            <div
              className="absolute bg-black/95 backdrop-blur-sm border border-white/20 rounded-xl p-4 text-white w-80 shadow-2xl"
              style={{
                left: textBlockX,
                top: textBlockY,
                zIndex: 15
              }}
            >
              <div className="text-lg font-bold text-white mb-2">
                {annotation.text}
              </div>
              <div className="text-sm text-slate-300 leading-relaxed mb-3">
                {annotation.description}
              </div>
              
              {/* Connection indicator dot */}
              <div 
                className="absolute w-3 h-3 bg-white rounded-full border-2 border-black"
                style={{
                  [isLeftSide ? 'right' : 'left']: -6,
                  top: '50%',
                  transform: 'translateY(-50%)'
                }}
              />
            </div>

            {/* Target point indicator */}
            <div
              className="absolute w-4 h-4 bg-white rounded-full border-2 border-black shadow-lg"
              style={{
                left: clampedX - 8,
                top: clampedY - 8,
                zIndex: 20
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

import React, { useState, useEffect } from "react";

/**
 * 2D Annotation Overlays - renders arrows and text based on 3D positions
 */
export function AnnotationOverlays() {
  const [annotations, setAnnotations] = useState([]);
  const [currentSection, setCurrentSection] = useState(0);

  // Function to parse description text and convert bullet points to JSX
  const parseDescription = (description) => {
    if (!description) return null;

    // Split by lines and check if any line starts with bullet point indicators
    const lines = description.split('\n');
    const bulletLines = [];
    const textLines = [];
    
    let currentBulletGroup = [];
    let hasBullets = false;

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      // Check for bullet point indicators: •, *, -, or numbered lists
      if (trimmedLine.match(/^[•*-]\s+/) || trimmedLine.match(/^\d+\.\s+/)) {
        hasBullets = true;
        // If we have accumulated text lines, process them first
        if (textLines.length > 0) {
          bulletLines.push({
            type: 'text',
            content: textLines.join(' '),
            key: `text-${index}`
          });
          textLines.length = 0;
        }
        
        // Add to current bullet group
        const bulletText = trimmedLine.replace(/^[•*-]\s+/, '').replace(/^\d+\.\s+/, '');
        currentBulletGroup.push(bulletText);
      } else if (trimmedLine) {
        // If we have accumulated bullets, close the group
        if (currentBulletGroup.length > 0) {
          bulletLines.push({
            type: 'bullets',
            content: [...currentBulletGroup],
            key: `bullets-${index}`
          });
          currentBulletGroup.length = 0;
        }
        textLines.push(trimmedLine);
      }
    });

    // Process any remaining content
    if (currentBulletGroup.length > 0) {
      bulletLines.push({
        type: 'bullets',
        content: [...currentBulletGroup],
        key: `bullets-final`
      });
    }
    if (textLines.length > 0) {
      bulletLines.push({
        type: 'text',
        content: textLines.join(' '),
        key: `text-final`
      });
    }

    // If no special formatting was found, return as regular text
    if (!hasBullets) {
      return (
        <div className="text-sm text-slate-300 leading-relaxed">
          {description}
        </div>
      );
    }

    // Render the parsed content
    return (
      <div className="space-y-2">
        {bulletLines.map((item) => {
          if (item.type === 'text') {
            return (
              <div key={item.key} className="text-sm text-slate-300 leading-relaxed">
                {item.content}
              </div>
            );
          } else if (item.type === 'bullets') {
            return (
              <ul key={item.key} className="text-sm text-slate-300 leading-relaxed ml-3 space-y-1">
                {item.content.map((bullet, idx) => (
                  <li key={`${item.key}-${idx}`} className="flex items-start">
                    <span className="text-white mr-2 mt-0.5">•</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            );
          }
          return null;
        })}
      </div>
    );
  };

  useEffect(() => {
    const onUpdateAnnotations = (e) => {
      const { annotations: newAnnotations } = e.detail || {};
      setAnnotations(newAnnotations || []);
    };

    const onSectionChange = (e) => {
      const { section } = e.detail || {};
      setCurrentSection(section);
    };

    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("updateAnnotations", onUpdateAnnotations);
      window.addEventListener("sectionChange", onSectionChange);
      return () => {
        window.removeEventListener("updateAnnotations", onUpdateAnnotations);
        window.removeEventListener("sectionChange", onSectionChange);
      };
    }
  }, []);

  // Hide annotations in section 7
  if (currentSection === 7) {
    return null;
  }

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
        
        // Detect if we're on mobile device
        const isMobile = window.innerWidth <= 768; // Standard mobile breakpoint
        
        // Position text blocks at top or bottom based on device type
        let textBlockY;
        const annotationHeight = 140; // Approximate height of annotation card
        const marginFromEdge = 20;
        
        if (isMobile && annotation.position === "bottom") {
          // On mobile: use bottom positioning if specified
          const bottomPositions = annotations.filter(ann => ann.position === "bottom");
          const bottomIndex = bottomPositions.indexOf(annotation);
          textBlockY = window.innerHeight - marginFromEdge - annotationHeight - (bottomIndex * 160);
        } else if (isMobile && annotation.position === "top") {
          // On mobile: use top positioning if specified
          const topPositions = annotations.filter(ann => ann.position === "top");
          const topIndex = topPositions.indexOf(annotation);
          textBlockY = marginFromEdge + (topIndex * 160);
        } else {
          // On desktop: always position from top down regardless of annotation.position
          textBlockY = marginFromEdge + (index * 160);
        }
        
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
              className="absolute bg-black/99 backdrop-blur-md border border-white/30 rounded-xl p-4 text-white w-80 shadow-2xl"
              style={{
                left: textBlockX,
                top: textBlockY,
                zIndex: 15
              }}
            >
              <div className="text-lg font-bold text-white mb-2">
                {annotation.text}
              </div>
              <div className="mb-3">
                {parseDescription(annotation.description)}
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

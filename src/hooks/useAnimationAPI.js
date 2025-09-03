import { useState, useEffect } from "react";
import { animationsBridge } from "../utils/animationsBridge";

export function useAnimationAPI() {
  const [clipNames, setClipNames] = useState([]);
  const [group, setGroup] = useState(null);

  useEffect(() => {
    const cleanup = animationsBridge.subscribe(({ actions, group: sceneGroup }) => {
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

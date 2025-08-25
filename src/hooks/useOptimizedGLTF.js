import { useGLTF } from '@react-three/drei';
import { useEffect, useState } from 'react';

/**
 * Custom hook to attempt loading gzipped GLB files first, then fallback to original
 * This provides better loading performance for large GLB files
 */
export function useOptimizedGLTF(originalUrl) {
  const [finalUrl, setFinalUrl] = useState(originalUrl);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    const tryGzippedVersion = async () => {
      const gzipUrl = originalUrl + '.gz';
      
      try {
        // Check if gzipped version exists
        const response = await fetch(gzipUrl, { method: 'HEAD' });
        if (response.ok) {
          console.log(`Using gzipped version: ${gzipUrl}`);
          setFinalUrl(gzipUrl);
        } else {
          console.log(`Gzipped version not found, using original: ${originalUrl}`);
          setFinalUrl(originalUrl);
        }
      } catch (error) {
        console.log(`Error checking gzipped version, using original: ${originalUrl}`);
        setFinalUrl(originalUrl);
      } finally {
        setIsLoading(false);
      }
    };
    
    tryGzippedVersion();
  }, [originalUrl]);
  
  // Only load the GLB once we've determined the final URL
  const gltf = useGLTF(isLoading ? null : finalUrl);
  
  return {
    ...gltf,
    isLoading: isLoading || !gltf.scene,
    finalUrl
  };
}

/**
 * Preload function that tries gzipped version first
 */
export function preloadOptimizedGLTF(originalUrl) {
  const gzipUrl = originalUrl + '.gz';
  
  // Try to preload gzipped version first
  fetch(gzipUrl, { method: 'HEAD' })
    .then(response => {
      if (response.ok) {
        console.log(`Preloading gzipped version: ${gzipUrl}`);
        useGLTF.preload(gzipUrl);
      } else {
        console.log(`Preloading original version: ${originalUrl}`);
        useGLTF.preload(originalUrl);
      }
    })
    .catch(() => {
      console.log(`Preloading original version: ${originalUrl}`);
      useGLTF.preload(originalUrl);
    });
}

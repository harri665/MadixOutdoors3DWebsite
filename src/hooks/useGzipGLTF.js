import { useEffect, useState } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as pako from 'pako';

// Cache to prevent re-loading the same GLB file multiple times
const gltfCache = new Map();

/**
 * Custom hook for loading gzipped GLTF files
 */
export function useGzipGLTF(url) {
  const [gltf, setGltf] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Check if we already have this GLB in cache
    if (gltfCache.has(url)) {
      const cachedData = gltfCache.get(url);
      if (cachedData.error) {
        setError(cachedData.error);
        setLoading(false);
      } else {
        console.log(`Using cached GLB: ${url}`);
        setGltf(cachedData.gltf);
        setLoading(false);
      }
      return;
    }

    async function loadGzipGLTF() {
      try {
        setLoading(true);
        setError(null);

        // Fetch the gzipped file
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
        }

        // Get the compressed data as array buffer
        const compressedData = await response.arrayBuffer();
        
        // Check if it's actually gzipped by looking at magic bytes
        const view = new Uint8Array(compressedData);
        const isGzipped = view[0] === 0x1f && view[1] === 0x8b;
        
        let decompressedData;
        if (isGzipped) {
          console.log(`Decompressing gzipped GLB: ${url}`);
          // Decompress using pako
          decompressedData = pako.inflate(compressedData);
        } else {
          console.log(`File is not gzipped, using as-is: ${url}`);
          decompressedData = new Uint8Array(compressedData);
        }

        // Create a blob URL for the decompressed data
        const blob = new Blob([decompressedData], { type: 'application/octet-stream' });
        const blobUrl = URL.createObjectURL(blob);

        if (cancelled) return;

        // Load the GLTF using the blob URL
        const loader = new GLTFLoader();
        
        // Set up DRACO loader for compressed geometry
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        dracoLoader.setDecoderConfig({ type: 'js' });
        loader.setDRACOLoader(dracoLoader);
        
        loader.load(
          blobUrl,
          (loadedGltf) => {
            if (!cancelled) {
              console.log(`Successfully loaded GLB with ${loadedGltf.animations?.length || 0} animations`);
              // Cache the successful result
              gltfCache.set(url, { gltf: loadedGltf, error: null });
              setGltf(loadedGltf);
              setLoading(false);
            }
            // Clean up the blob URL and DRACO loader
            URL.revokeObjectURL(blobUrl);
            dracoLoader.dispose();
          },
          undefined,
          (loadError) => {
            if (!cancelled) {
              console.error('GLTFLoader error:', loadError);
              // Cache the error result
              gltfCache.set(url, { gltf: null, error: loadError });
              setError(loadError);
              setLoading(false);
            }
            // Clean up the blob URL and DRACO loader
            URL.revokeObjectURL(blobUrl);
            dracoLoader.dispose();
          }
        );

      } catch (err) {
        if (!cancelled) {
          // Cache the error result
          gltfCache.set(url, { gltf: null, error: err });
          setError(err);
          setLoading(false);
        }
      }
    }

    loadGzipGLTF();

    return () => {
      cancelled = true;
    };
  }, [url]);

  return { scene: gltf?.scene, animations: gltf?.animations, loading, error };
}

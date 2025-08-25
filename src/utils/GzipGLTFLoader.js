import React from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import pako from 'pako';

/**
 * Custom hook to load gzipped GLB files with fallback to uncompressed
 */
export function useGzipGLTF(url) {
  const [gltfData, setGltfData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    const loadGLTF = async () => {
      try {
        setLoading(true);
        
        // Try to load gzipped version first
        const gzipUrl = url + '.gz';
        let response;
        let data;

        try {
          response = await fetch(gzipUrl);
          if (response.ok) {
            console.log(`Loading gzipped GLB: ${gzipUrl}`);
            const arrayBuffer = await response.arrayBuffer();
            
            // Decompress the gzipped data
            const decompressed = pako.inflate(new Uint8Array(arrayBuffer));
            data = decompressed.buffer;
          } else {
            throw new Error('Gzipped version not found');
          }
        } catch (gzipError) {
          console.log(`Falling back to original: ${url}`);
          response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to load ${url}`);
          }
          data = await response.arrayBuffer();
        }

        if (cancelled) return;

        // Parse the GLB data using GLTFLoader
        const loader = new GLTFLoader();
        
        // Set up DRACO loader for compressed geometry
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        dracoLoader.setDecoderConfig({ type: 'js' });
        loader.setDRACOLoader(dracoLoader);
        
        loader.parse(data, '', (gltf) => {
          if (!cancelled) {
            setGltfData(gltf);
            setLoading(false);
          }
          dracoLoader.dispose();
        }, (error) => {
          if (!cancelled) {
            setError(error);
            setLoading(false);
          }
          dracoLoader.dispose();
        });

      } catch (err) {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      }
    };

    loadGLTF();

    return () => {
      cancelled = true;
    };
  }, [url]);

  return { 
    scene: gltfData?.scene, 
    animations: gltfData?.animations || [], 
    loading, 
    error 
  };
}

/**
 * Simple loader component that handles gzipped GLB files
 */
export function GzipGLTFLoader({ url, children }) {
  const { scene, animations, loading, error } = useGzipGLTF(url);

  if (loading) {
    return <group>Loading...</group>;
  }

  if (error) {
    console.error('Failed to load GLB:', error);
    return <group>Error loading model</group>;
  }

  return children({ scene, animations });
}

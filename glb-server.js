import express from 'express';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Simple Express server to serve gzipped files with proper headers
const app = express();
const port = 3001;

// Serve static files from public directory
app.use(express.static('public'));

// Special handling for .gz files
app.get('*.glb.gz', (req, res) => {
  const filePath = req.path;
  
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Encoding': 'gzip',
    'Cache-Control': 'public, max-age=31536000' // Cache for 1 year
  });
  
  res.sendFile(filePath, { root: './public' });
});

app.listen(port, () => {
  console.log(`GLB server running at http://localhost:${port}`);
});

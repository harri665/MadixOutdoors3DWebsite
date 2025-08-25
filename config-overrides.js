const path = require('path');
const fs = require('fs');

module.exports = function override(config, env) {
  // Configure webpack to handle .gz files
  config.module.rules.push({
    test: /\.(glb|gltf)\.gz$/,
    use: [
      {
        loader: 'file-loader',
        options: {
          name: '[name].[ext]',
          outputPath: 'static/media/',
        },
      },
    ],
  });

  // In development, configure dev server to serve gzipped GLB files correctly
  if (env === 'development') {
    config.devServer = {
      ...config.devServer,
      setupMiddlewares: (middlewares, devServer) => {
        if (!devServer) {
          throw new Error('webpack-dev-server is not defined');
        }

        // Add middleware to serve gzipped GLB files with correct headers
        devServer.app.get('*.glb', (req, res, next) => {
          const filePath = path.join(process.cwd(), 'public', req.path);
          
          // Check if this is actually a gzipped file
          if (fs.existsSync(filePath)) {
            try {
              // Read first few bytes to check if it's gzipped
              const buffer = fs.readFileSync(filePath, { start: 0, end: 2 });
              const isGzipped = buffer[0] === 0x1f && buffer[1] === 0x8b;
              
              if (isGzipped) {
                console.log(`Serving gzipped GLB: ${req.path}`);
                res.set({
                  'Content-Type': 'application/octet-stream',
                  'Content-Encoding': 'gzip',
                  'Cache-Control': 'public, max-age=3600'
                });
              }
            } catch (error) {
              console.warn(`Error checking if ${req.path} is gzipped:`, error.message);
            }
          }
          
          next();
        });

        return middlewares;
      },
    };
  }

  return config;
};

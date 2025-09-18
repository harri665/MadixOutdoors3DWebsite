const CompressionPlugin = require('compression-webpack-plugin');

module.exports = function override(config, env) {
  // Add compression plugin for production builds
  if (env === 'production') {
    config.plugins.push(
      new CompressionPlugin({
        filename: '[path][base].gz',
        algorithm: 'gzip',
        test: /\.(js|css|html|svg|glb|gltf)$/,
        threshold: 8192,
        minRatio: 0.8,
      })
    );
  }

  // Add support for .glb and .gltf files
  config.module.rules.push({
    test: /\.(glb|gltf)$/,
    type: 'asset/resource',
    generator: {
      filename: 'static/models/[hash][ext][query]'
    }
  });

  // Support for .gz files
  config.module.rules.push({
    test: /\.gz$/,
    type: 'asset/resource',
    generator: {
      filename: 'static/models/[hash][ext][query]'
    }
  });

  return config;
};
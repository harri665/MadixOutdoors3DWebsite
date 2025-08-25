# Docker Deployment Guide

This guide explains how to deploy the React website using Docker and Portainer.

## Files Created

- `Dockerfile` - Multi-stage build for production
- `docker-compose.yml` - Basic Docker Compose configuration
- `docker-compose.prod.yml` - Production-ready configuration with environment variables
- `nginx.conf` - Custom Nginx configuration for serving React app and GLB files
- `.dockerignore` - Files to exclude from Docker build
- `.env.example` - Environment variables template

## Local Development

### Quick Start
```bash
# Build and run with basic compose file
docker-compose up --build

# Or use the production configuration
docker-compose -f docker-compose.prod.yml up --build
```

### With Environment Variables
1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` file with your settings:
   ```
   CONTAINER_NAME=my-website
   HOST_PORT=8080
   DOMAIN=mysite.com
   ```

3. Run with environment variables:
   ```bash
   docker-compose -f docker-compose.prod.yml up --build
   ```

## Portainer Deployment via Git

### Method 1: Portainer Git Repository Stack

1. **In Portainer UI:**
   - Go to "Stacks"
   - Click "Add stack"
   - Choose "Repository" as source
   - Enter your Git repository URL
   - Set the compose file path: `docker-compose.prod.yml`

2. **Environment Variables:**
   - Add environment variables in Portainer's stack configuration:
     ```
     CONTAINER_NAME=website-app
     HOST_PORT=3000
     DOMAIN=your-domain.com
     ```

3. **Deploy:**
   - Click "Deploy the stack"

### Method 2: Portainer Webhook Auto-Deploy

1. **Create the stack first** using Method 1
2. **Enable webhook** in stack settings
3. **Configure Git webhook** to call Portainer's webhook URL on push

## Configuration Options

### Port Configuration
- Change `HOST_PORT` in `.env` to modify the external port
- Default: `3000:80` (external:internal)

### Domain Configuration
- Set `DOMAIN` in `.env` for Traefik reverse proxy
- Remove Traefik labels if not using reverse proxy

### SSL/HTTPS
- The Traefik labels are configured for automatic SSL with Let's Encrypt
- Modify or remove these labels based on your setup

## Custom Nginx Configuration

The included `nginx.conf` provides:
- Gzip compression for better performance
- Proper handling of gzipped GLB files (for your 3D models)
- SPA routing support (React Router)
- Security headers
- Caching for static assets
- Health check endpoint at `/health`

## Troubleshooting

### Build Issues
- Ensure all dependencies are in `package.json`
- Check that the build process works locally: `npm run build`

### GLB File Issues
- Gzipped GLB files are served with proper `Content-Encoding: gzip` header
- Cache headers are set for better performance

### Container Access
- Check container logs: `docker-compose logs website`
- Access container shell: `docker-compose exec website sh`

### Health Checks
- The container includes a health check endpoint at `/health`
- Monitor health in Portainer's container view

## Production Considerations

1. **Resource Limits**: Add resource limits to the compose file if needed
2. **Backup**: Consider backing up the logs volume
3. **Monitoring**: Set up monitoring for the container
4. **Updates**: Use Portainer's webhook feature for automatic deployments

## File Structure After Setup
```
website/
├── docker-compose.yml           # Basic configuration
├── docker-compose.prod.yml      # Production configuration
├── Dockerfile                   # Build instructions
├── nginx.conf                   # Web server configuration
├── .dockerignore               # Build exclusions
├── .env.example                # Environment template
└── DOCKER_DEPLOYMENT.md        # This guide
```

# Portainer Deployment Guide

This guide explains how to deploy the 3D Tent Showcase Website using Portainer's "Deploy from Git Repository" feature.

## Prerequisites

- Portainer CE/EE installed and running
- Docker and Docker Compose available on your system
- Git repository access (public or with credentials configured)

## Deployment Steps

### 1. Access Portainer

1. Log into your Portainer instance
2. Navigate to **Stacks** in the left sidebar
3. Click **Add Stack** button

### 2. Configure Git Repository Deployment

1. **Stack Name**: Enter a name (e.g., `tent-website`)
2. **Build Method**: Select **Git Repository**
3. **Repository URL**: Enter your git repository URL
4. **Repository Reference**: Enter `main` (or your target branch)
5. **Compose Path**: Leave as `docker-compose.yml` (default)

### 3. Environment Variables (Optional)

Add these environment variables in the **Environment Variables** section:

```bash
# Basic Configuration
EXTERNAL_PORT=8080
CONTAINER_NAME=tent-website
NODE_ENV=production

# For custom domain (if using reverse proxy)
DOMAIN=your-domain.com
```

### 4. Advanced Configuration (Optional)

If you need to customize the deployment, you can:

1. **Auto-updates**: Enable if you want Portainer to automatically pull updates
2. **Relative Path**: Leave empty unless your docker-compose.yml is in a subdirectory
3. **Additional Files**: Add `.env` file if you need custom environment variables

### 5. Deploy

1. Click **Deploy the Stack**
2. Wait for the build and deployment process to complete
3. Check the logs for any issues

## Access Your Application

Once deployed, your application will be available at:
- **Local**: `http://your-server-ip:8080`
- **With Domain**: `http://your-domain.com` (if reverse proxy configured)

## Port Configuration

The default configuration uses port `8080` to avoid conflicts. If you need to change this:

1. Edit the stack in Portainer
2. Go to the **Environment Variables** section
3. Change `EXTERNAL_PORT` to your desired port
4. Update the stack

## Reverse Proxy Setup (Optional)

If you're using Traefik or another reverse proxy:

1. Uncomment the Traefik labels in `docker-compose.yml`
2. Update the domain name in the labels
3. Ensure your reverse proxy network is properly configured

### Example Traefik Labels

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.website.rule=Host(`your-domain.com`)"
  - "traefik.http.routers.website.entrypoints=websecure"
  - "traefik.http.routers.website.tls.certresolver=letsencrypt"
  - "traefik.http.services.website.loadbalancer.server.port=80"
```

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   - Change `EXTERNAL_PORT` to a different port
   - Check what's running on port 8080: `netstat -tulpn | grep 8080`

2. **Build Failures**
   - Check the build logs in Portainer
   - Ensure all required files are in the repository
   - Verify Node.js version compatibility

3. **Container Won't Start**
   - Check container logs in Portainer
   - Verify nginx configuration
   - Ensure port 80 is exposed in container

### Logs

To check logs:
1. Go to **Containers** in Portainer
2. Find your `tent-website` container
3. Click **Logs** to view output

### Manual Commands

If you need to troubleshoot manually:

```bash
# Check container status
docker ps | grep tent-website

# View logs
docker logs tent-website

# Restart container
docker restart tent-website

# Access container shell
docker exec -it tent-website /bin/sh
```

## Updates

To update your deployment:

1. Push changes to your git repository
2. In Portainer, go to your stack
3. Click **Update the Stack**
4. Select **Pull latest image** if you want to rebuild
5. Click **Update**

## Resource Requirements

- **CPU**: 1 core minimum
- **RAM**: 512MB minimum (1GB recommended)
- **Storage**: 2GB minimum for build process
- **Network**: Port 8080 (or configured port) accessible

## Security Considerations

- The application runs on port 8080 by default
- Consider using a reverse proxy for SSL termination
- Regularly update the base images
- Monitor container logs for any issues

## Support

If you encounter issues:
1. Check the container logs first
2. Verify your environment variables
3. Ensure the git repository is accessible
4. Check Portainer documentation for git deployment specifics

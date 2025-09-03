#!/bin/bash

# Deployment verification script for Tent Website
# This script helps verify that the deployment is working correctly

echo "🎪 Tent Website Deployment Verification"
echo "======================================="

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running or not accessible"
    exit 1
fi

echo "✅ Docker is running"

# Check if docker-compose is available
if ! command -v docker-compose >/dev/null 2>&1; then
    echo "❌ Docker Compose is not installed"
    exit 1
fi

echo "✅ Docker Compose is available"

# Function to check if container is running
check_container() {
    local container_name="tent-website"
    if docker ps --format "table {{.Names}}" | grep -q "^$container_name$"; then
        echo "✅ Container '$container_name' is running"
        return 0
    else
        echo "❌ Container '$container_name' is not running"
        return 1
    fi
}

# Function to check if port is accessible
check_port() {
    local port=${1:-8080}
    local host=${2:-localhost}
    
    echo "🔍 Checking if application is accessible on $host:$port..."
    
    if curl -s -o /dev/null -w "%{http_code}" "http://$host:$port" | grep -q "200"; then
        echo "✅ Application is accessible on port $port"
        return 0
    else
        echo "❌ Application is not accessible on port $port"
        return 1
    fi
}

# Function to show container logs
show_logs() {
    local container_name="tent-website"
    echo "📋 Recent logs from '$container_name':"
    echo "======================================"
    docker logs --tail 20 "$container_name" 2>/dev/null || echo "❌ Could not retrieve logs"
}

# Function to show container status
show_status() {
    echo "📊 Container Status:"
    echo "==================="
    docker ps --filter "name=tent-website" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
}

# Main verification
echo ""
echo "🔍 Performing deployment verification..."
echo ""

# Check container status
show_status
echo ""

# Check if container is running
if check_container; then
    echo ""
    
    # Check if application is accessible
    check_port 8080
    
    echo ""
    echo "🎯 Quick Health Check URLs:"
    echo "  • http://localhost:8080 (main application)"
    echo "  • http://your-server-ip:8080 (from external)"
    
else
    echo ""
    echo "🚨 Container is not running. Showing recent logs:"
    show_logs
    echo ""
    echo "💡 Try these troubleshooting steps:"
    echo "  1. Check if port 8080 is already in use: netstat -tulpn | grep 8080"
    echo "  2. Restart the stack in Portainer"
    echo "  3. Check the build logs for any errors"
    echo "  4. Verify all environment variables are correct"
fi

echo ""
echo "🔧 Useful Commands:"
echo "==================="
echo "  • View logs: docker logs tent-website"
echo "  • Restart container: docker restart tent-website"
echo "  • Access container: docker exec -it tent-website /bin/sh"
echo "  • Check nginx config: docker exec tent-website nginx -t"
echo ""

# Optional: Test specific endpoints
echo "🧪 Testing specific endpoints..."
echo "================================"

endpoints=(
    "/"
    "/static/css"
    "/static/js"
    "/favicon.ico"
)

for endpoint in "${endpoints[@]}"; do
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:8080$endpoint" | grep -q "200\|304"; then
        echo "✅ $endpoint - OK"
    else
        echo "❌ $endpoint - Failed"
    fi
done

echo ""
echo "🎪 Verification complete!"
echo "========================="

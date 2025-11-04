#!/bin/bash

echo "🚀 Starting Zero Downtime Hub with Ngrok..."

# Create necessary directories
mkdir -p data/repos data/apps logs/nginx nginx/sites data/images

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check for ngrok authtoken
if [ -z "$NGROK_AUTHTOKEN" ]; then
    echo "⚠️  NGROK_AUTHTOKEN not set. Using free ngrok version (limited)"
    echo "💡 Get your free token at: https://dashboard.ngrok.com/get-started/your-authtoken"
    echo "💡 Then run: export NGROK_AUTHTOKEN=your_token_here"
else
    echo "✅ Ngrok authtoken detected - custom subdomains enabled"
fi

# Build and start services
echo "📦 Building Docker images..."
docker compose build

echo "🚀 Starting services..."
docker compose up -d

echo "⏳ Waiting for services to be ready..."
sleep 15

# Check if services are healthy
echo "🔍 Checking service health..."

if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Backend is running"
else
    echo "❌ Backend failed to start"
    docker compose logs backend
    exit 1
fi

if curl -f http://localhost:8080 > /dev/null 2>&1; then
    echo "✅ Frontend is running"
else
    echo "❌ Frontend failed to start"
    docker compose logs frontend
    exit 1
fi

# Check ngrok status
echo "🔗 Checking ngrok status..."
curl -s http://localhost:3000/api/ngrok/status | grep -q '"success":true' && echo "✅ Ngrok service ready" || echo "⚠️  Ngrok service may have issues"

echo ""
echo "🎉 Zero Downtime Hub is now running!"
echo ""
echo "📊 Dashboard: http://localhost:8080"
echo "🔧 API: http://localhost:3000"
echo "🗄️ MongoDB: localhost:27017"
echo "🔗 Ngrok Status: http://localhost:3000/api/ngrok/status"
echo ""
echo "💡 To deploy your first app:"
echo "1. Open http://localhost:8080"
echo "2. Register/Login"
echo "3. Click 'Deploy New App'"
echo "4. Enter GitHub URL and deploy!"
echo "5. Get public ngrok URL for your app"
echo ""
echo "To stop: docker-compose down"
echo "To view logs: docker-compose logs -f"
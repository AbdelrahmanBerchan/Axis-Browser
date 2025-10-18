#!/bin/bash

echo "🌐 Starting Axis Browser..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies first..."
    npm install
fi

# Start the browser
echo "🚀 Launching Axis Browser..."
npm start

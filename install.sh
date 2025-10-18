#!/bin/bash

echo "🚀 Installing Axis Browser..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "Visit: https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully!"
    echo ""
    echo "🎉 Axis Browser is ready to use!"
    echo ""
    echo "To start the browser, run:"
    echo "  npm start"
    echo ""
    echo "For development mode:"
    echo "  npm run dev"
    echo ""
    echo "To build the application:"
    echo "  npm run build"
else
    echo "❌ Failed to install dependencies."
    exit 1
fi

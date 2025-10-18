# Axis Browser - Setup Guide

A minimalistic, customizable, and beautiful browser built on Electron with a modern dark theme and smooth animations.

## 📋 Prerequisites

Before you begin, make sure you have the following installed on your system:

- **Node.js** (version 16.0.0 or higher recommended)
- **npm** (comes with Node.js)
- **Git** (for cloning the repository)

### Checking Your Installation

```bash
node --version
npm --version
git --version
```

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd "Axis Browser"
```

### 2. Install Dependencies

Install all required Node.js packages:

```bash
npm install
```

This will install:
- **Electron** (v35.7.5) - The core framework
- **electron-builder** (v25.1.8) - For building distributables
- **electron-store** (v8.1.0) - For persistent data storage

### 3. Run the Browser

Start the development version:

```bash
npm start
```

Or run with development flags:

```bash
npm run dev
```

## 🎯 Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Launch the browser in production mode |
| `npm run dev` | Launch with development flags |
| `npm run build` | Build the application |
| `npm run dist` | Create distributable packages |

## 🏗️ Building for Distribution

### Create Installers

Build platform-specific installers:

```bash
npm run dist
```

This creates installers for:
- **macOS**: `.dmg` file
- **Windows**: `.exe` installer
- **Linux**: `.AppImage` file

### Build Output

Distributables will be created in the `dist/` directory.


## ⚡ Features

- **🌙 Dark Theme**: Modern, easy-on-the-eyes interface
- **📱 Responsive Design**: Adapts to different screen sizes
- **🎨 Smooth Animations**: Professional, minimalistic transitions
- **📚 History Management**: Real browsing history tracking
- **⬇️ Downloads Manager**: Built-in download management
- **⌨️ Keyboard Shortcuts**: Full keyboard navigation support
- **🔍 Search Integration**: Quick access to search functionality
- **📑 Tab Management**: Drag-and-drop tab reordering
- **⚙️ Customizable Sidebar**: Resizable sidebar with smooth interactions

## 🎮 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + T` | New Tab |
| `Cmd/Ctrl + W` | Close Tab |
| `Cmd/Ctrl + Y` | Open History |
| `Cmd/Ctrl + J` | Open Downloads |
| `Cmd/Ctrl + B` | Open Bookmarks |
| `Cmd/Ctrl + K` | Focus Search |
| `Cmd/Ctrl + +` | Zoom In |
| `Cmd/Ctrl + -` | Zoom Out |
| `Cmd/Ctrl + 0` | Reset Zoom |

## 🐛 Troubleshooting

### Common Issues

**Issue**: `npm install` fails with permission errors
```bash
# Solution: Use sudo (macOS/Linux) or run as administrator (Windows)
sudo npm install
```

**Issue**: Electron fails to start
```bash
# Solution: Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**Issue**: Build process fails
```bash
# Solution: Update electron-builder
npm install electron-builder@latest
```

### Node.js Version Issues

If you encounter Node.js version warnings:
- **Recommended**: Update to Node.js 18+ for best compatibility
- **Alternative**: Use Node Version Manager (nvm) to switch versions

## 🔧 Development

### Adding New Features

1. **Main Process**: Edit `src/main.js` for Electron APIs
2. **Renderer Process**: Edit `src/renderer.js` for UI logic
3. **Styling**: Update `src/styles.css` for visual changes
4. **HTML Structure**: Modify `src/index.html` for layout changes

### Debugging

Enable developer tools:
```bash
npm run dev
```

This opens the browser with developer tools enabled.

## 📦 Dependencies

### Core Dependencies
- **electron**: ^35.7.5 - Main framework
- **electron-store**: ^8.1.0 - Data persistence

### Development Dependencies
- **electron-builder**: ^25.1.8 - Build system

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request


## 🆘 Support

If you encounter any issues:

1. Check this setup guide
2. Review the troubleshooting section
3. Check Node.js and npm versions
4. Clear cache and reinstall dependencies
5. Open an issue on the repository

---

**Happy browsing with Axis! 🎉**

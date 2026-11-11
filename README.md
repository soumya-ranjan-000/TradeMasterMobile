# TradeMaster Mobile

A premium, high-performance mobile trading application built with **React Native**, **Expo**, **NativeWind (Tailwind CSS)**, and **Lucide Icons**.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS version)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Expo Go](https://expo.dev/expo-go) app installed on your physical device (iOS or Android)

### Installation

1. Navigate to the mobile project directory:

   ```bash
   cd TradeMasterMobile
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

### Running the App

1. Start the Expo development server:

   ```bash
   # Standard way (requires same Wi-Fi)
   npx expo start

   # If you have trouble connecting (e.g. firewalls), use Tunnel
   npx expo start --tunnel
   ```

2. This will open the Expo Dev Tools in your terminal and display a **QR Code**.

## 📱 Viewing on your Phone

To see the app on your physical device:

1. **Connect to the same Wi-Fi**: Ensure your computer and your phone are connected to the same local network.
2. **Open Expo Go**:
   - **Android**: Open the "Expo Go" app and tap "Scan QR Code". Scan the code shown in your terminal.
   - **iOS**: Open the default "Camera" app and scan the QR code. Tap the notification to open it in "Expo Go".
3. **Wait for Bundling**: The app will download and bundle the javascript files. You should see the TradeMaster splash screen and then the Dashboard!

## ⚙️ Configuration (Backend Connection)

If you are using a physical phone, you need to point the app to your computer's local IP address so it can communicate with the backend services.

1. Find your local IP address (e.g., `192.168.1.5`):
   - **Windows**: Run `ipconfig` in Command Prompt.
   - **Mac/Linux**: Run `ifconfig` or `ip addr`.
2. Copy `.env.example` to `.env` in the `TradeMasterMobile` directory (`.env` is gitignored).
3. Point the services at your IP:

   ```bash
   EXPO_PUBLIC_APP_ENV=local
   EXPO_PUBLIC_LOCAL_ORCHESTRATOR_URL=http://your-ip:8000      # TradeMasterBackend
   EXPO_PUBLIC_PAPER_BACKEND_URL=http://your-ip:8001/api/v1    # paper trading
   ```
4. Set `EXPO_PUBLIC_BACKEND_API_KEY` to the `SERVICE_API_KEY` of that backend.
   Every market-data call (search, charts, quotes, status, live ticks) goes
   through TradeMasterBackend with this key. Without it the backend answers
   401 and the live-price socket closes with code 1008.

The app never calls the Breeze service directly: its key controls the real
ICICI account, and anything compiled into the app can be extracted from it.

### Logging in

- **My Account**: enter your Trader ID (then PIN `0000`). It names your paper
  account; use the same ID everywhere. To have scanner trades land in it, set
  `portfolio.paper_user_id` to this ID in
  `TradeMasterBackend/config/scanner/scanner.yaml`.
- **Test User**: a shared demo paper account.

## ✨ Features

- **Premium Wallet Dashboard**: Gradient-styled balance cards and live stats.
- **Market Trends**: Real-time asset tracking with mock sparklines.
- **Smart Portfolio**: Track positions, P&L, and order history.
- **Stock Intelligence**: Detailed charts and key performance indicators.
- **Native Experience**: Smooth transitions and high-fidelity UI components.

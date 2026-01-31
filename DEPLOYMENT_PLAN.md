# Deployment Plan - TradeMaster Mobile

This plan outlines the steps required to deploy the TradeMaster mobile application to the Google Play Store and Apple App Store, as well as providing builds for internal testing.

## Phase 1: Preparation & Branding

- [x] **App Metadata**: Review and finalize the following in `app.json`:
  - `name`: TradeMaster
  - `slug`: TradeMasterMobile
  - `version`: 1.0.0
  - `android.package`: `com.samba.trademaster`
  - `ios.bundleIdentifier`: `com.samba.trademaster`
- [x] **Assets**: Replace placeholder icons and splash screens in `./assets`:
  - `icon.png` (1024x1024)
  - `adaptive-icon.png` (1024x1024)
  - `splash-icon.png` (2000x2000)
  - `favicon.png` (for web)
- [ ] **Environment Variables**: Ensure production API URLs are correctly set in EAS Secrets.
  - `EXPO_PUBLIC_PAPER_BACKEND_URL`
  - `EXPO_PUBLIC_BREEZE_API_URL`

## Phase 2: EAS Configuration

- [ ] **EAS Project Initialization**: Run `eas project:init` if not already linked.
- [ ] **Build Profiles**: Verify `eas.json` profiles:
  - `preview`: For generating APKs (Android) to test on devices.
  - `production`: For generating store-ready builds (AAB for Android, IPA for iOS).

## Phase 3: Android Deployment

- [ ] **Internal Testing**:
  - Run `eas build -p android --profile preview` to get an APK.
  - Install on physical devices to test connectivity with Render-hosted backend.
- [ ] **Production Build**:
  - Run `eas build -p android --profile production`.
  - Create a Google Play Console account.
  - Create a new app and upload the `.aab` file.
  - Complete the Google Play Store listing (screenshots, descriptions).

## Phase 4: iOS Deployment

- [ ] **Apple Developer Program**: Ensure membership is active ($99/year).
- [ ] **Build & TestFlight**:
  - Run `eas build -p ios --profile production`.
  - Upload to App Store Connect.
  - Configure TestFlight for internal/external beta testing.
- [ ] **Store Submission**:
  - Complete the App Store listing.
  - Submit for Review.

## Phase 5: Backend Hardening (Optional)

- [ ] **SSL/TLS**: Ensure all endpoints are HTTPS (currently done via Render).
- [ ] **Rate Limiting**: Implement basic rate limiting on backend endpoints to prevent abuse.
- [ ] **Monitoring**: Consider adding Sentry for crash reporting in the mobile app.

## Next Steps

1. **Finalize Assets**: Do you have icons and splash screens ready?
2. **Environment Check**: Are the Render URLs in `.env` final for the first release?
3. **EAS Login**: Ensure you are logged into EAS (`eas login`).

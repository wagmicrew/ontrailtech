# Requirements Document

## Introduction

The Expo Companion App is a React Native mobile application built with Expo that serves as the mobile counterpart to the OnTrail web platform. The app shares the same PostgreSQL database via the existing FastAPI backend at api.ontrail.tech. It provides mobile-native capabilities including step counting, health app synchronization, GPS-secured POI verification, and runner profile management. Authentication supports OTP email, Google Sign-In, Apple Sign-In, and ConnectKit/Family.co wallet login, all routed through the existing backend auth endpoints.

## Glossary

- **App**: The OnTrail Expo companion mobile application
- **API_Client**: The HTTP client module that communicates with api.ontrail.tech
- **Auth_Manager**: The authentication module handling login, token storage, and session refresh
- **Step_Tracker**: The module that reads the device pedometer sensor and records step counts
- **Health_Sync**: The module that reads data from Apple Health (iOS) or Google Fit (Android) and submits it to the API
- **GPS_Verifier**: The module that validates a user's physical proximity to a POI before allowing check-in
- **POI**: Point of Interest — a geolocated landmark that users can discover and mint as NFTs
- **Runner_Profile**: A user's public profile page showing reputation, stats, FriendPass data, and aura
- **Explore_Screen**: The map-based screen for discovering nearby POIs and routes
- **Secure_Storage**: The encrypted on-device storage used for JWT tokens and sensitive credentials
- **Token_Pair**: The combination of access_token and refresh_token used for authenticated API requests
- **Device_Attestation**: A mechanism to verify the integrity of the mobile device to prevent spoofing
- **Layout_Footer**: The footer section of the web application Layout component (apps/web/src/components/Layout.tsx) visible on desktop viewports
- **QR_Code**: A scannable two-dimensional barcode rendered in the Layout_Footer that encodes the Expo Go development URL
- **Admin_Panel**: The admin dashboard at /admin in the web application (apps/web/src/pages/Admin.tsx) with sidebar navigation for management sections
- **ExpoGoPage**: The admin panel section for monitoring and managing the Expo Go development server process
- **PM2_Ecosystem_Config**: The PM2 process manager configuration file at infra/pm2/ecosystem.config.js that defines managed application processes
- **Nginx_Config**: The Nginx reverse proxy configuration at infra/nginx/ontrail-tech.conf that routes subdomain traffic to backend services
- **DNS_Zone_File**: The BIND zone file at infra/dns/ontrail.tech.zone that maps subdomains to server IP addresses

## Requirements

### Requirement 1: API Client Foundation

**User Story:** As a mobile user, I want the app to communicate securely with the OnTrail backend, so that I can access all platform features from my phone.

#### Acceptance Criteria

1. THE API_Client SHALL send all requests to the base URL https://api.ontrail.tech with JSON content type headers
2. WHEN a valid Token_Pair exists in Secure_Storage, THE API_Client SHALL attach the access_token as a Bearer Authorization header on every authenticated request
3. WHEN the API returns HTTP 401 on an authenticated request, THE API_Client SHALL attempt a token refresh using the stored refresh_token before retrying the original request once
4. IF the token refresh request fails, THEN THE API_Client SHALL clear the Token_Pair from Secure_Storage and navigate the user to the login screen
5. THE API_Client SHALL use TLS for all network communication with the backend

### Requirement 2: OTP Email Authentication

**User Story:** As a user without a crypto wallet, I want to log in with my email via a one-time password, so that I can access OnTrail without needing Web3 knowledge.

#### Acceptance Criteria

1. WHEN the user submits a valid email address on the login screen, THE Auth_Manager SHALL call the POST /auth/request-otp endpoint with the email
2. WHEN the API responds with a success message, THE App SHALL display a 6-digit OTP input screen
3. WHEN the user submits a valid 6-digit OTP code, THE Auth_Manager SHALL call the POST /auth/verify-otp endpoint with the email and code
4. WHEN the API returns a valid AuthResponse, THE Auth_Manager SHALL store the Token_Pair in Secure_Storage and navigate to the home screen
5. IF the OTP verification fails, THEN THE App SHALL display the error message returned by the API and allow the user to retry

### Requirement 3: Google Sign-In Authentication

**User Story:** As a user with a Google account, I want to sign in with Google, so that I can onboard quickly using my existing identity.

#### Acceptance Criteria

1. WHEN the user taps the Google sign-in button, THE Auth_Manager SHALL initiate the Google OAuth flow using expo-auth-session and obtain an id_token
2. WHEN a valid Google id_token is obtained, THE Auth_Manager SHALL call the POST /auth/google endpoint with the id_token
3. WHEN the API returns a valid AuthResponse, THE Auth_Manager SHALL store the Token_Pair in Secure_Storage and navigate to the home screen
4. IF the Google OAuth flow is cancelled by the user, THEN THE App SHALL return to the login screen without displaying an error

### Requirement 4: Apple Sign-In Authentication

**User Story:** As an iOS user, I want to sign in with Apple, so that I can use my Apple ID for quick and private onboarding.

#### Acceptance Criteria

1. WHILE the App is running on an iOS device, THE App SHALL display the Apple Sign-In button on the login screen
2. WHEN the user taps the Apple sign-in button, THE Auth_Manager SHALL initiate the Apple authentication flow using expo-apple-authentication and obtain an identity token
3. WHEN a valid Apple identity token is obtained, THE Auth_Manager SHALL call the POST /auth/apple endpoint with the identity_token
4. WHEN the API returns a valid AuthResponse, THE Auth_Manager SHALL store the Token_Pair in Secure_Storage and navigate to the home screen
5. IF the Apple authentication flow is cancelled by the user, THEN THE App SHALL return to the login screen without displaying an error

### Requirement 5: Wallet Login via ConnectKit / Family.co

**User Story:** As a Web3 user, I want to connect my external wallet (MetaMask, WalletConnect) via ConnectKit, so that I can use my existing crypto identity on OnTrail mobile.

#### Acceptance Criteria

1. WHEN the user taps the wallet login button, THE Auth_Manager SHALL present the ConnectKit wallet selection modal
2. WHEN the user selects and connects a wallet, THE Auth_Manager SHALL call the POST /auth/challenge endpoint with the connected wallet_address to obtain a sign-in message
3. WHEN the challenge message is received, THE Auth_Manager SHALL request the connected wallet to sign the message
4. WHEN a valid signature is obtained, THE Auth_Manager SHALL call the POST /auth/wallet endpoint with the wallet_address, signature, and message
5. WHEN the API returns a valid AuthResponse, THE Auth_Manager SHALL store the Token_Pair in Secure_Storage and navigate to the home screen
6. IF the wallet connection or signing is rejected by the user, THEN THE App SHALL return to the login screen without displaying an error

### Requirement 6: Session Management and Secure Token Storage

**User Story:** As a returning user, I want to stay logged in between app launches, so that I do not need to re-authenticate every time I open the app.

#### Acceptance Criteria

1. THE Auth_Manager SHALL store the Token_Pair in the device Secure_Storage (expo-secure-store) using AES encryption
2. WHEN the App launches, THE Auth_Manager SHALL check Secure_Storage for an existing Token_Pair and call GET /users/me to validate the session
3. WHEN the session validation succeeds, THE App SHALL navigate directly to the home screen
4. IF the session validation fails after a refresh attempt, THEN THE Auth_Manager SHALL clear Secure_Storage and navigate to the login screen
5. WHEN the user taps the logout button, THE Auth_Manager SHALL call POST /auth/logout with the refresh_token, clear Secure_Storage, and navigate to the login screen


### Requirement 7: Step Counter

**User Story:** As a runner, I want the app to count my steps throughout the day, so that I can earn step-based rewards on the OnTrail platform.

#### Acceptance Criteria

1. THE Step_Tracker SHALL read the device pedometer data using expo-sensors Pedometer API
2. WHEN the user grants motion permission, THE Step_Tracker SHALL begin recording step counts from the device pedometer
3. THE Step_Tracker SHALL submit accumulated step counts to the POST /steps/sync endpoint at intervals no shorter than 5 minutes and no longer than 30 minutes while the App is in the foreground
4. WHEN the App returns to the foreground after being backgrounded, THE Step_Tracker SHALL query the pedometer for steps accumulated during the background period and submit them to the API
5. IF the device does not have a pedometer sensor, THEN THE App SHALL display a message indicating that step counting is not available on the device
6. THE Step_Tracker SHALL display the current daily step count on the home screen

### Requirement 8: Health App Synchronization

**User Story:** As a fitness-conscious user, I want the app to sync my health data from Apple Health or Google Fit, so that my real-world activity is reflected in my OnTrail profile.

#### Acceptance Criteria

1. WHILE the App is running on iOS, THE Health_Sync SHALL request read access to Apple Health step count, distance walked/run, and active energy burned data
2. WHILE the App is running on Android, THE Health_Sync SHALL request read access to Google Fit step count, distance, and calories burned data
3. WHEN health permissions are granted, THE Health_Sync SHALL read the health data for the current day and submit it to the POST /health/sync endpoint
4. THE Health_Sync SHALL synchronize health data with the API once per hour while the App is in the foreground
5. IF the user denies health data permissions, THEN THE App SHALL continue to function with step counting from the device pedometer only and display a prompt to enable health sync in settings
6. WHEN health data is successfully synced, THE App SHALL display the synced metrics (steps, distance, calories) on the runner profile screen

### Requirement 9: Runner Profile Screen

**User Story:** As a runner, I want to view and edit my profile on mobile, so that I can manage my OnTrail identity on the go.

#### Acceptance Criteria

1. THE App SHALL display the Runner_Profile screen with the user's username, avatar, bio, reputation score, rank, aura level, and step balance by calling GET /users/me and GET /users/runner/{username}
2. WHEN the user taps the edit profile button, THE App SHALL display an edit form with fields for username, email, bio, location, and preferred reward wallet
3. WHEN the user submits the edit form, THE App SHALL call PATCH /users/me/profile with the updated fields and display the updated profile on success
4. WHEN the user taps the change avatar button, THE App SHALL open the device image picker and upload the selected image to POST /users/me/media/profile-image
5. THE App SHALL display the FriendPass stats (sold count, max supply, current price) and supporter count on the profile screen
6. THE App SHALL display the user's aura level and total aura score on the profile screen

### Requirement 10: Explore Screen with Map and POI Discovery

**User Story:** As an explorer, I want to discover nearby POIs on a map, so that I can plan routes and find interesting locations.

#### Acceptance Criteria

1. THE Explore_Screen SHALL display a map view centered on the user's current GPS location using react-native-maps
2. WHEN the map loads or the user pans the map, THE Explore_Screen SHALL call GET /poi/nearby with the map center coordinates and a radius of 10 km
3. THE Explore_Screen SHALL render each POI as a map marker with a color corresponding to the POI rarity (common: gray, rare: blue, epic: purple, legendary: gold)
4. WHEN the user taps a POI marker, THE Explore_Screen SHALL display a detail card showing the POI name, rarity, distance from user, and description
5. WHEN the user taps the mint POI button, THE Explore_Screen SHALL call POST /poi/mint with the POI name and the user's current GPS coordinates
6. IF the device GPS is unavailable, THEN THE Explore_Screen SHALL display a message requesting the user to enable location services

### Requirement 11: GPS Security Feature Lock for POI Verification

**User Story:** As a platform operator, I want POI check-ins to be verified by GPS proximity, so that users cannot fake their location to earn rewards.

#### Acceptance Criteria

1. WHEN the user attempts to check in at a POI, THE GPS_Verifier SHALL obtain the device's current GPS coordinates with high accuracy (accuracy threshold of 50 meters or less)
2. THE GPS_Verifier SHALL calculate the distance between the user's GPS coordinates and the POI coordinates using the Haversine formula
3. IF the calculated distance exceeds 200 meters, THEN THE GPS_Verifier SHALL reject the check-in and display a message indicating the user is too far from the POI
4. WHEN the GPS coordinates are within 200 meters of the POI, THE GPS_Verifier SHALL call POST /route/checkin with the user's coordinates, the POI ID, and a timestamp
5. THE GPS_Verifier SHALL include the device GPS accuracy value in the check-in request payload so the backend can apply additional validation
6. IF the device returns a GPS accuracy value greater than 100 meters, THEN THE GPS_Verifier SHALL warn the user that GPS signal is weak and the check-in may be rejected by the server

### Requirement 12: Navigation and Tab Structure

**User Story:** As a mobile user, I want a clear tab-based navigation, so that I can quickly switch between the main app sections.

#### Acceptance Criteria

1. THE App SHALL display a bottom tab navigator with four tabs: Home, Explore, Profile, and Settings
2. THE Home tab SHALL display the daily step count, recent activity summary, and quick-access cards for nearby POIs and active routes
3. THE Explore tab SHALL display the Explore_Screen with the map and POI discovery features
4. THE Profile tab SHALL display the Runner_Profile screen
5. THE Settings tab SHALL display options for logout, health sync permissions, notification preferences, and app version information
6. WHEN the user is not authenticated, THE App SHALL display only the login screen and hide the tab navigator

### Requirement 13: Offline Resilience and Data Caching

**User Story:** As a runner on a trail with poor connectivity, I want the app to cache data and queue actions, so that I do not lose progress when offline.

#### Acceptance Criteria

1. THE App SHALL cache the most recent runner profile data, nearby POI list, and step count locally on the device
2. WHEN the device has no network connectivity, THE App SHALL display cached data and indicate offline status with a visible banner
3. WHEN the user performs a check-in or step sync while offline, THE App SHALL queue the request locally
4. WHEN network connectivity is restored, THE App SHALL process all queued requests in the order they were created
5. IF a queued request fails after connectivity is restored, THEN THE App SHALL retry the request up to 3 times with exponential backoff before discarding it and notifying the user

### Requirement 14: Push Notifications

**User Story:** As a user, I want to receive push notifications for important events, so that I stay engaged with the platform.

#### Acceptance Criteria

1. WHEN the user logs in for the first time, THE App SHALL request push notification permission and register the device token with the backend via POST /users/me/device-token
2. WHEN a push notification is received while the App is in the foreground, THE App SHALL display an in-app notification banner
3. WHEN the user taps a push notification, THE App SHALL deep-link to the relevant screen (profile, explore, or home) based on the notification payload
4. THE Settings screen SHALL provide a toggle to enable or disable push notifications
5. WHEN the user disables push notifications in settings, THE App SHALL call DELETE /users/me/device-token to unregister the device

### Requirement 15: Device Attestation for Anti-Cheat

**User Story:** As a platform operator, I want the mobile app to verify device integrity, so that spoofed or rooted devices cannot submit fraudulent activity data.

#### Acceptance Criteria

1. WHEN the App submits step data or a GPS check-in, THE App SHALL include a device attestation token in the request headers
2. WHILE the App is running on iOS, THE App SHALL generate the attestation token using the Apple App Attest API
3. WHILE the App is running on Android, THE App SHALL generate the attestation token using the Google Play Integrity API
4. IF the device attestation check fails or is unavailable, THEN THE App SHALL still submit the request but include a flag indicating attestation was not verified, allowing the backend to apply reduced trust scoring


### Requirement 16: Expo Go QR Code in Website Footer

**User Story:** As a website visitor, I want to scan a QR code in the site footer, so that I can quickly open the OnTrail companion app in Expo Go on my mobile device.

#### Acceptance Criteria

1. THE Layout_Footer SHALL display a QR code image that encodes the URL expo.ontrail.tech
2. THE QR_Code SHALL be rendered as an SVG or image element with a minimum size of 120x120 pixels and sufficient contrast for reliable scanning
3. THE Layout_Footer SHALL display a label next to the QR code with the text "Try the mobile app" and the URL expo.ontrail.tech
4. WHEN the website is viewed on a screen width below 768 pixels, THE Layout_Footer SHALL hide the QR code to avoid cluttering the mobile web layout
5. THE QR_Code SHALL link to the Expo Go development server URL (expo.ontrail.tech) so that users with Expo Go installed can load the companion app directly

### Requirement 17: Admin Panel for Expo Go Management

**User Story:** As an admin, I want a dedicated Expo Go section in the admin panel, so that I can monitor and manage the Expo Go development server without SSH access.

#### Acceptance Criteria

1. THE Admin_Panel SHALL include an "Expo Go" navigation item in the sidebar that loads the ExpoGoPage admin section
2. WHEN the ExpoGoPage loads, THE Admin_Panel SHALL call GET /admin/expo/status and display the current Expo Go dev server status (running, stopped, or errored), the configured port number, and the process uptime
3. WHEN the admin clicks the "Restart Server" button, THE Admin_Panel SHALL call POST /admin/expo/restart and display a confirmation message when the restart completes
4. WHEN the admin submits a new port number via the port configuration form, THE Admin_Panel SHALL call PUT /admin/expo/port with the new port value and display the updated configuration on success
5. IF the GET /admin/expo/status request fails, THEN THE Admin_Panel SHALL display an error message indicating the Expo Go server status is unavailable
6. THE ExpoGoPage SHALL display the most recent 50 lines of Expo Go process logs retrieved from GET /admin/expo/logs
7. THE ExpoGoPage SHALL display a list of active Expo Go sessions and connection count retrieved from GET /admin/expo/sessions

### Requirement 18: PM2 Process and Subdomain Hosting for Expo Go

**User Story:** As a platform operator, I want the Expo Go dev server to run as a managed PM2 process accessible via expo.ontrail.tech, so that mobile testers can connect to the companion app reliably from the production server.

#### Acceptance Criteria

1. THE PM2_Ecosystem_Config SHALL include an "ontrail-expo" application entry that runs the Expo dev server from the apps/mobile directory with a configurable port (default 8081)
2. THE Nginx_Config SHALL include a server block for expo.ontrail.tech that proxies HTTPS requests to the local Expo Go dev server port on 127.0.0.1
3. THE DNS_Zone_File SHALL include an A record for the "expo" subdomain pointing to the production server IP address (85.208.51.194)
4. THE API SHALL expose a GET /admin/expo/status endpoint that returns the PM2 process status, uptime, memory usage, and configured port for the ontrail-expo process
5. THE API SHALL expose a POST /admin/expo/restart endpoint that restarts the ontrail-expo PM2 process and returns the new process status
6. THE API SHALL expose a PUT /admin/expo/port endpoint that updates the Expo Go server port in the PM2 ecosystem configuration and restarts the process with the new port
7. THE API SHALL expose a GET /admin/expo/logs endpoint that returns the most recent 50 lines from the ontrail-expo PM2 log file
8. THE API SHALL expose a GET /admin/expo/sessions endpoint that returns the count and details of active Expo Go WebSocket connections
9. IF the ontrail-expo PM2 process is not running when a restart is requested, THEN THE API SHALL start the process instead and return the new status
10. THE Nginx server block for expo.ontrail.tech SHALL proxy WebSocket connections (upgrade headers) to support Expo Go live reload and hot module replacement

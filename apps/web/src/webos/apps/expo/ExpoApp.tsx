// ExpoApp — re-exports the existing ExpoGoPage which manages the Expo development server, port, mode, logs and sessions.
// The internal adminFetch is scoped to that page; a future refactor can migrate it to ../../core/admin-fetch.
export { default } from '../../../pages/admin/ExpoGoPage';

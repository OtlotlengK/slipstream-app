# VynoTap Native Mobile

This directory is the foundation for the dedicated VynoTap Android and iOS applications.

## Product direction

- Keep the existing VynoTap website as the browser experience.
- Build native Android and iOS applications with React Native and Expo.
- Use Expo Router for native navigation and shared route structure.
- Preserve the website's VynoTap branding, terminology, and business workflows while adapting layouts and controls to mobile.
- Connect all clients to the existing production Supabase project. Do not create a second user pool or copy production users into another project.

## Production integration

The mobile app must use only:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The publishable key is suitable for public clients; never add a Supabase secret or service-role key to this app. All authorization remains enforced by the existing database policies and server-side Edge Functions.

Authentication must persist on-device using secure platform storage, refresh sessions when the app returns to the foreground, and support the existing email/password and email OTP flows. A user signs in with the same email and password used on vynotap.com. The website and native app have separate device sessions but the same Supabase identity and business records.

## Initial native screen map

1. Authentication: sign in, create account, email verification code, forgot password and reset password.
2. Home: business greeting, key activity, quick actions and overview.
3. Invoices: invoice centre, create invoice, invoice detail and payment status.
4. Receipts: receipt vault, create receipt, receipt detail and public verification.
5. Business Passport: business profile and public identity.
6. Catalogue: saved products and services, with stock management deferred.
7. Account: profile, preferences, security and sign out.

## Visual system

See `src/theme/tokens.ts`. The mobile UI should retain the VynoTap dark navy surfaces, violet-to-emerald monogram, teal operational accents, clear status colours, strong typography and rounded cards. Prefer native components and accessible touch targets over embedding website pages in a WebView.

## Integration rules

- Do not rewrite or replace the website to build the mobile apps.
- Do not change production database schemas or deploy Edge Functions as part of UI work without a separate reviewed change.
- Reuse existing production tables, RPCs and Edge Functions only after inspecting their contracts and RLS policies.
- Do not duplicate payment, invoice-total, receipt-verification or POP Shield business logic in the mobile client. Call the existing trusted backend paths.
- Never expose service-role credentials or payment secrets in the app bundle.
- Keep native work on a dedicated feature branch and use pull requests. Do not commit directly to `main`.

## Delivery

- Android: EAS development/internal builds first, then a signed Play Store AAB and APK for direct testing where appropriate.
- iOS: EAS iOS build, TestFlight validation, then App Store submission.
- Validate login, account recovery, invoice creation, receipt issue/verification, file uploads and payment handoffs on physical devices before store submission.

## Build status

This is an architecture foundation, not a releasable app yet. The previous Capacitor WebView wrapper is not the target native implementation.

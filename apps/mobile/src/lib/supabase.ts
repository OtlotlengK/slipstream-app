import { AppState, Platform } from "react-native";
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, processLock } from "@supabase/supabase-js";

// This is the same production project used by vynotap.com.
// The publishable key is intended for public clients; database access is
// governed by RLS and server-side functions. Never put a service-role key here.
const supabaseUrl = "https://pddjualtnhgmplampucn.supabase.co";
const supabasePublishableKey = "sb_publishable_31VRHyY4ze-5FqJU7CKooA_PzYUIYCH";

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    ...(Platform.OS !== "web" ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
});

if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

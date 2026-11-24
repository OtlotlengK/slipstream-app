import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../src/lib/supabase";

export default function OnboardingScreen() {
  const [business, setBusiness] = useState("");
  const [owner, setOwner] = useState("");
  const [phone, setPhone] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { router.replace("/sign-in"); return; }
      const { data, error: lookupError } = await supabase
        .from("merchants").select("business_name,owner_name,phone").eq("id", user.id).maybeSingle();
      if (!active) return;
      if (lookupError) { setError(lookupError.message); setReady(true); return; }
      setBusiness(data?.business_name ?? String(user.user_metadata?.business_name ?? ""));
      setOwner(data?.owner_name ?? String(user.user_metadata?.owner_name ?? ""));
      setPhone(data?.phone ?? "");
      setReady(true);
    };
    load();
    return () => { active = false; };
  }, []);

  const save = async () => {
    setError("");
    if (!business.trim()) { setError("Business name is required."); return; }
    setBusy(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("Your session has expired. Please sign in again.");
      const { data: existing, error: lookupError } = await supabase
        .from("merchants").select("id").eq("id", user.id).maybeSingle();
      if (lookupError) throw lookupError;
      const payload = { business_name: business.trim(), owner_name: owner.trim() || null, phone: phone.trim() || null };
      const result = existing
        ? await supabase.from("merchants").update(payload).eq("id", user.id).select("id").single()
        : await supabase.from("merchants").insert({ id: user.id, ...payload }).select("id").single();
      if (result.error) throw result.error;
      if (!result.data?.id) throw new Error("Your business profile could not be confirmed.");
      router.replace("/(app)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't save your business profile.");
    } finally { setBusy(false); }
  };

  if (!ready) return <View style={styles.loading}><ActivityIndicator color="#6C4CF1" size="large" /></View>;

  return (
    <KeyboardAvoidingView style={styles.loading} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.mark}><Text style={styles.markText}>VT</Text></View>
          <Text style={styles.brandName}>VynoTap</Text>
          <Text style={styles.muted}>Set up your business profile</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>MERCHANT ONBOARDING</Text>
          <Text style={styles.title}>Tell us about your business</Text>
          <Text style={styles.muted}>These details appear on your VynoTap merchant account and can be updated later.</Text>
          <Field label="Business name" value={business} onChangeText={setBusiness} />
          <Field label="Owner / contact name" value={owner} onChangeText={setOwner} />
          <Field label="Business phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Pressable onPress={save} disabled={busy} style={styles.button}>
            {busy ? <ActivityIndicator color="#0B1220" /> : <Text style={styles.buttonText}>Create Business Profile</Text>}
          </Pressable>
        </View>
        <Text style={styles.footer}>VynoTap © 2026</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field(props: { label: string; value: string; onChangeText: (value: string) => void; keyboardType?: "default" | "phone-pad" }) {
  return <View style={styles.field}>
    <Text style={styles.label}>{props.label.toUpperCase()}</Text>
    <TextInput value={props.value} onChangeText={props.onChangeText} keyboardType={props.keyboardType ?? "default"} autoCapitalize="words" style={styles.input} placeholder={props.label} placeholderTextColor="#7C8AA0" />
  </View>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: "#0B1220" },
  content: { flexGrow: 1, justifyContent: "center", padding: 22, paddingTop: 44, paddingBottom: 36 },
  brand: { alignItems: "center", marginBottom: 30 },
  mark: { width: 64, height: 64, borderRadius: 20, backgroundColor: "#151F30", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  markText: { color: "#8B73FF", fontSize: 28, fontWeight: "900", letterSpacing: -3 },
  brandName: { color: "#F8FAFC", fontSize: 30, fontWeight: "900" },
  muted: { color: "#A8B4C7", fontSize: 13, lineHeight: 20, marginTop: 7 },
  card: { backgroundColor: "#111827", borderColor: "#334155", borderWidth: 1, borderRadius: 24, padding: 22 },
  eyebrow: { color: "#D8B84C", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: "#F8FAFC", fontSize: 23, fontWeight: "900", marginTop: 8 },
  field: { marginTop: 18 },
  label: { color: "#A8B4C7", fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginBottom: 8 },
  input: { backgroundColor: "#0B1220", borderWidth: 1, borderColor: "#475569", borderRadius: 13, paddingHorizontal: 14, paddingVertical: 14, color: "#F8FAFC", fontSize: 15 },
  error: { color: "#FCA5A5", backgroundColor: "#3F151B", borderRadius: 10, padding: 12, marginTop: 16 },
  button: { backgroundColor: "#D8B84C", borderRadius: 14, minHeight: 54, alignItems: "center", justifyContent: "center", marginTop: 22 },
  buttonText: { color: "#0B1220", fontWeight: "900", fontSize: 14 },
  footer: { color: "#7C8AA0", textAlign: "center", marginTop: 24, fontSize: 11 },
});

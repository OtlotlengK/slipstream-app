import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";

export default function HomeScreen() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const signOut = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (!error) router.replace("/sign-in");
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>VynoTap</Text>
          <Text style={styles.eyebrow}>BUSINESS WORKSPACE</Text>
        </View>
        <Pressable onPress={signOut} style={styles.signOut} disabled={busy}>
          {busy ? <ActivityIndicator color="#F8FAFC" /> : <Text style={styles.signOutText}>Sign out</Text>}
        </Pressable>
      </View>
      <Text style={styles.kicker}>OVERVIEW</Text>
      <Text style={styles.title}>Stay in control of your business.</Text>
      <Text style={styles.subtitle}>{email ? `Signed in as ${email}` : "Your business operations, in one place."}</Text>

      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>MONEY · PAYMENTS · PROOF · IDENTITY</Text>
        <Text style={styles.heroTitle}>Manage invoices, payments and receipts in one place.</Text>
        <Text style={styles.heroBody}>Create invoices, track payments, issue receipts and keep a clear record of every transaction.</Text>
        <Action title="Create new invoice" onPress={() => router.push("/(app)/invoices")} />
        <Action title="Open invoice centre" secondary onPress={() => router.push("/(app)/invoices")} />
        <Action title="Open receipt vault" secondary onPress={() => router.push("/(app)/receipts")} />\n        <Action title="Open product catalogue" secondary onPress={() => router.push("/(app)/catalogue")} />
      </View>

      <View style={styles.passport}>
        <Text style={styles.heroEyebrow}>BUSINESS IDENTITY · TRUST LAYER</Text>
        <Text style={styles.passportTitle}>Your Business Passport</Text>
        <Text style={styles.heroBody}>Your business identity and verification profile.</Text>
        <Action title="View Business Passport" secondary onPress={() => router.push("/(app)/passport")} />
      </View>
      <Text style={styles.footer}>VynoTap · One business identity across your devices</Text>
    </ScrollView>
  );
}

function Action({ title, secondary = false }: { title: string; secondary?: boolean }) {
  return <Pressable onPress={() => {}} style={[styles.action, secondary && styles.actionSecondary]}>
    <Text style={styles.actionText}>{title}  →</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B1220" },
  content: { padding: 22, paddingTop: 58, paddingBottom: 44 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 42 },
  brand: { color: "#F8FAFC", fontSize: 22, fontWeight: "900", letterSpacing: 1.2 },
  eyebrow: { color: "#A8B4C7", fontSize: 10, fontWeight: "800", letterSpacing: 2, marginTop: 5 },
  signOut: { borderColor: "#475569", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  signOutText: { color: "#F8FAFC", fontWeight: "700", fontSize: 12 },
  kicker: { color: "#A8B4C7", fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  title: { color: "#F8FAFC", fontSize: 30, lineHeight: 36, fontWeight: "900", marginTop: 12, letterSpacing: -0.8 },
  subtitle: { color: "#A8B4C7", fontSize: 14, marginTop: 12, marginBottom: 26 },
  hero: { backgroundColor: "#151F30", borderRadius: 24, borderWidth: 1, borderColor: "#334155", padding: 20, marginBottom: 20, overflow: "hidden" },
  heroEyebrow: { color: "#A8B4C7", fontSize: 10, fontWeight: "900", letterSpacing: 1.6, marginBottom: 16 },
  heroTitle: { color: "#F8FAFC", fontSize: 28, lineHeight: 34, fontWeight: "900", letterSpacing: -0.7 },
  heroBody: { color: "#CBD5E1", fontSize: 14, lineHeight: 22, marginTop: 14, marginBottom: 18 },
  action: { minHeight: 54, borderRadius: 14, backgroundColor: "#0F766E", alignItems: "center", justifyContent: "center", marginTop: 10, paddingHorizontal: 12 },
  actionSecondary: { backgroundColor: "#2B3547", borderWidth: 1, borderColor: "#475569" },
  actionText: { color: "#F8FAFC", fontWeight: "800", fontSize: 14 },
  passport: { backgroundColor: "#123B36", borderRadius: 24, borderWidth: 1, borderColor: "#1D665B", padding: 20 },
  passportTitle: { color: "#F8FAFC", fontSize: 24, fontWeight: "900" },
  footer: { color: "#7C8AA0", fontSize: 11, textAlign: "center", marginTop: 32 },
});

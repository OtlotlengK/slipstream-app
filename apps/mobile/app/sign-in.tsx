import { useState, type ComponentProps } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../src/lib/supabase";

type Mode = "login" | "signup" | "verify" | "forgot" | "recover";

export default function SignInScreen() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [business, setBusiness] = useState("");
  const [owner, setOwner] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (task: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await task(); } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  };

  const signIn = () => run(async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    router.replace("/");
  });

  const signUp = () => run(async () => {
    if (!business.trim() || !owner.trim()) throw new Error("Enter your business name and your name.");
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { data: { business_name: business.trim(), owner_name: owner.trim() } },
    });
    if (error) throw error;
    if (data.session) router.replace("/");
    else { setMode("verify"); setNotice("Your account has been created. Enter the eight-digit code sent to your email."); }
  });

  const verify = () => run(async () => {
    if (!/^\d{8}$/.test(code)) throw new Error("Enter the eight-digit verification code.");
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: "signup" });
    if (error) throw error;
    router.replace("/");
  });

  const resend = () => run(async () => {
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
    if (error) throw error;
    setNotice("A new verification code has been sent.");
  });

  const sendRecovery = () => run(async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) throw error;
    setMode("recover");
    setNotice("Enter the eight-digit password reset code sent to your email.");
  });

  const finishRecovery = () => run(async () => {
    if (!/^\d{8}$/.test(code)) throw new Error("Enter the eight-digit code.");
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(), token: code, type: "recovery",
    });
    if (verifyError) throw verifyError;
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) throw updateError;
    router.replace("/");
  });

  const title = mode === "signup" ? "Create your account" :
    mode === "verify" ? "Verify your email" :
    mode === "forgot" ? "Reset your password" :
    mode === "recover" ? "Choose a new password" : "Welcome back";
  const subtitle = mode === "login" ? "Log in to your VynoTap business." :
    mode === "signup" ? "Set up your VynoTap business account." :
    mode === "verify" ? "Your email keeps your account secure." :
    mode === "forgot" ? "We'll send a one-time verification code." :
    "Enter the code from your email and choose a new password.";

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.mark}><Text style={styles.markText}>VT</Text></View>
          <Text style={styles.brandName}>VynoTap</Text>
          <Text style={styles.tagline}>The trust layer for business transactions</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.heading}>{title}</Text>
          <Text style={styles.subheading}>{subtitle}</Text>
          {(mode === "login" || mode === "signup" || mode === "verify" || mode === "forgot" || mode === "recover") && (
            <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" editable={mode !== "verify" && mode !== "recover"} />
          )}
          {mode === "signup" && <>
            <Field label="Business name" value={business} onChangeText={setBusiness} />
            <Field label="Your name" value={owner} onChangeText={setOwner} />
          </>}
          {(mode === "login" || mode === "signup" || mode === "recover") && (
            <Field label={mode === "recover" ? "New password" : "Password"} value={password} onChangeText={setPassword} secureTextEntry />
          )}
          {(mode === "verify" || mode === "recover") && (
            <Field label="Eight-digit email code" value={code} onChangeText={v => setCode(v.replace(/\D/g, "").slice(0, 8))} keyboardType="number-pad" />
          )}
          {!!error && <Text style={styles.error}>{error}</Text>}
          {!!notice && <Text style={styles.notice}>{notice}</Text>}
          <Pressable disabled={busy} onPress={
            mode === "login" ? signIn : mode === "signup" ? signUp :
            mode === "verify" ? verify : mode === "forgot" ? sendRecovery : finishRecovery
          } style={({ pressed }) => [styles.primary, pressed && styles.pressed, busy && styles.disabled]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>
              {mode === "login" ? "Log in" : mode === "signup" ? "Create account" :
                mode === "verify" ? "Verify email" : mode === "forgot" ? "Send reset code" : "Update password"}
            </Text>}
          </Pressable>
          {mode === "login" && <>
            <Text onPress={() => setMode("forgot")} style={styles.link}>Forgot password?</Text>
            <Text onPress={() => { setMode("signup"); setError(""); setNotice(""); }} style={styles.link}>Don't have an account? Create one</Text>
          </>}
          {mode === "signup" && <Text onPress={() => setMode("login")} style={styles.link}>Already have an account? Log in</Text>}
          {mode === "verify" && <Text onPress={resend} style={styles.link}>Resend verification code</Text>}
          {(mode === "forgot" || mode === "recover" || mode === "verify") && <Text onPress={() => { setMode("login"); setCode(""); setError(""); setNotice(""); }} style={styles.link}>Back to log in</Text>}
        </View>
        <Text style={styles.footer}>VynoTap © 2026</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field(props: ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...input } = props;
  return <View style={styles.field}>
    <Text style={styles.label}>{label.toUpperCase()}</Text>
    <TextInput placeholder={label} placeholderTextColor="#7C8AA0" style={styles.input}
      selectionColor="#6C4CF1" autoCorrect={false} {...input} />
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#0B1220" },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 22, paddingTop: 44, paddingBottom: 36 },
  brand: { alignItems: "center", marginBottom: 34 },
  mark: { width: 76, height: 76, borderRadius: 22, backgroundColor: "#151F30", alignItems: "center", justifyContent: "center", marginBottom: 14, borderWidth: 1, borderColor: "#334155" },
  markText: { fontSize: 32, fontWeight: "900", color: "#8B73FF", letterSpacing: -3 },
  brandName: { color: "#F8FAFC", fontSize: 34, fontWeight: "900", letterSpacing: -1.5 },
  tagline: { color: "#A8B4C7", fontSize: 14, marginTop: 6, textAlign: "center" },
  card: { backgroundColor: "#111827", borderColor: "#334155", borderWidth: 1, borderRadius: 24, padding: 22 },
  heading: { color: "#F8FAFC", fontSize: 25, fontWeight: "800" },
  subheading: { color: "#A8B4C7", fontSize: 14, marginTop: 7, marginBottom: 22, lineHeight: 21 },
  field: { marginBottom: 17 },
  label: { color: "#A8B4C7", fontSize: 11, fontWeight: "800", letterSpacing: 1.1, marginBottom: 8 },
  input: { backgroundColor: "#0B1220", borderWidth: 1, borderColor: "#475569", borderRadius: 14, paddingHorizontal: 15, paddingVertical: 15, color: "#F8FAFC", fontSize: 16 },
  primary: { backgroundColor: "#6C4CF1", borderRadius: 14, minHeight: 56, justifyContent: "center", alignItems: "center", marginTop: 5 },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.86 },
  disabled: { opacity: 0.6 },
  link: { color: "#A78BFA", fontSize: 14, fontWeight: "700", textAlign: "center", marginTop: 20 },
  error: { color: "#FCA5A5", backgroundColor: "#3F151B", borderRadius: 10, padding: 12, marginBottom: 12, overflow: "hidden" },
  notice: { color: "#A7F3D0", backgroundColor: "#052E2B", borderRadius: 10, padding: 12, marginBottom: 12, overflow: "hidden" },
  footer: { color: "#7C8AA0", textAlign: "center", marginTop: 28, fontSize: 12 },
});

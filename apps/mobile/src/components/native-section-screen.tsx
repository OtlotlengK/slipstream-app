import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

type Props = { title: string; eyebrow: string; description: string; next: string };

export function NativeSectionScreen({ title, eyebrow, description, next }: Props) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>←  Back to overview</Text></Pressable>
      <Text style={styles.brand}>VynoTap</Text>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{description}</Text>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Native workflow foundation</Text>
        <Text style={styles.body}>This screen is part of the native VynoTap application. The next implementation step is connecting this workflow to the existing production data and business rules.</Text>
        <Text style={styles.next}>NEXT: {next}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B1220" },
  content: { padding: 22, paddingTop: 58, paddingBottom: 40 },
  back: { alignSelf: "flex-start", paddingVertical: 10, paddingRight: 16, marginBottom: 28 },
  backText: { color: "#A78BFA", fontSize: 14, fontWeight: "800" },
  brand: { color: "#F8FAFC", fontSize: 21, fontWeight: "900", letterSpacing: 1.1 },
  eyebrow: { color: "#10B981", fontSize: 10, fontWeight: "900", letterSpacing: 1.8, marginTop: 30 },
  title: { color: "#F8FAFC", fontSize: 30, lineHeight: 36, fontWeight: "900", marginTop: 10 },
  body: { color: "#CBD5E1", fontSize: 14, lineHeight: 22, marginTop: 12 },
  panel: { marginTop: 28, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: "#334155", backgroundColor: "#151F30" },
  panelTitle: { color: "#F8FAFC", fontSize: 17, fontWeight: "800" },
  next: { color: "#A78BFA", fontSize: 11, fontWeight: "900", letterSpacing: 1.1, marginTop: 22 },
});

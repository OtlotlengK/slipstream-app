import { useEffect, useState } from "react";
import { ActivityIndicator, Text, Pressable, View } from "react-native";
import { Redirect } from "expo-router";
import { supabase } from "../src/lib/supabase";

type Destination = "/sign-in" | "/(app)" | "/(app)/onboarding";

export default function IndexRoute() {
  const [destination, setDestination] = useState<Destination>();
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let active = true;
    const resolve = async () => {
      setDestination(undefined);
      setProblem("");
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        if (active) setProblem(userError.message);
        return;
      }
      if (!user) {
        if (active) setDestination("/sign-in");
        return;
      }
      const { data: merchant, error } = await supabase
        .from("merchants")
        .select("id,business_name")
        .eq("id", user.id)
        .maybeSingle();
      if (error) {
        if (active) setProblem("We couldn't load your business profile. Check your connection and try again.");
        return;
      }
      if (active) setDestination(merchant?.business_name ? "/(app)" : "/(app)/onboarding");
    };
    resolve();
    const { data: listener } = supabase.auth.onAuthStateChange(() => { resolve(); });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (problem) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: "#0B1220" }}>
        <Text style={{ color: "#F8FAFC", fontSize: 17, fontWeight: "800", textAlign: "center" }}>{problem}</Text>
        <Pressable onPress={() => { setProblem(""); setDestination(undefined); supabase.auth.getSession().then(() => setDestination("/sign-in")); }} style={{ marginTop: 18, padding: 14 }}>
          <Text style={{ color: "#A78BFA", fontWeight: "800" }}>Return to sign in</Text>
        </Pressable>
      </View>
    );
  }
  if (!destination) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0B1220" }}><ActivityIndicator color="#6C4CF1" size="large" /></View>;
  }
  return <Redirect href={destination} />;
}

import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function IndexRoute() {
  const [destination, setDestination] = useState<"/sign-in" | "/(app)">();
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setDestination(data.session ? "/(app)" : "/sign-in");
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setDestination(session ? "/(app)" : "/sign-in");
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!destination) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0B1220" }}>
        <ActivityIndicator color="#6C4CF1" size="large" />
      </View>
    );
  }
  return <Redirect href={destination} />;
}

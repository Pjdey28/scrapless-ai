"use client";

import { supabase } from "@/lib/supabase";
import type { Order } from "@/types/api";

export async function saveOrder(order: Order): Promise<void> {
  if (!supabase) return;
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Sign in before saving an order.");
  const { error } = await supabase.from("production_orders").upsert(
    {
      user_id: userData.user.id,
      order_id: order.order_id,
      name: order.name,
      parts: order.parts,
    },
    { onConflict: "user_id,order_id" },
  );
  if (error) throw error;
}
